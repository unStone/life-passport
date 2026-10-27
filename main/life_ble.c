#include "life_ble.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "host/ble_hs.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs_mbuf.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nvs_flash.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *TAG = "life_ble";
#define LIFE_UUID(n) BLE_UUID128_INIT(0x20,0x92,0x57,0xa6,0x9a,0x7e,0x49,0x89,0x9f,0x4a,0x8b,0xc1,n,0x00,0x3b,0xe1)
static const ble_uuid128_t s_service = LIFE_UUID(0x01);
static const ble_uuid128_t s_rx = LIFE_UUID(0x02);
static const ble_uuid128_t s_tx = LIFE_UUID(0x03);
static const ble_uuid128_t s_status = LIFE_UUID(0x04);
static SemaphoreHandle_t s_mutex, s_stopped;
static QueueHandle_t s_seeds;
static TaskHandle_t s_host;
static life_wire_t s_wire;
static char s_reply[192] = "{\"v\":1,\"id\":0,\"ok\":true,\"state\":\"ready\",\"w\":36,\"h\":32}";
static atomic_bool s_active, s_connected, s_dirty, s_subscribed;
static atomic_uint s_connection = BLE_HS_CONN_HANDLE_NONE;
static uint16_t s_tx_handle;
static uint8_t s_addr_type;

static void check(int rc, const char *operation) {
    if (rc) {
        ESP_LOGE(TAG, "%s failed: NimBLE rc=%d", operation, rc);
        abort();
    }
}

static void reply_locked(uint32_t id, const char *state, const char *error, uint16_t population, uint32_t crc) {
    int size;
    if (error) size = snprintf(s_reply, sizeof(s_reply),
        "{\"v\":1,\"id\":%lu,\"ok\":false,\"error\":\"%s\"}", (unsigned long)id, error);
    else size = snprintf(s_reply, sizeof(s_reply),
        "{\"v\":1,\"id\":%lu,\"ok\":true,\"state\":\"%s\",\"population\":%u,\"crc\":%lu}",
        (unsigned long)id, state, population, (unsigned long)crc);
    ESP_ERROR_CHECK(size > 0 && size < sizeof(s_reply) ? ESP_OK : ESP_ERR_INVALID_SIZE);
    s_dirty = true;
}

void life_ble_reply(uint32_t id, const char *state, const char *error, uint16_t population, uint32_t crc) {
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    reply_locked(id, state, error, population, crc);
    xSemaphoreGive(s_mutex);
}

static int access_gatt(uint16_t connection, uint16_t attribute, struct ble_gatt_access_ctxt *ctx, void *arg) {
    (void)connection;
    (void)attribute;
    (void)arg;
    if (xSemaphoreTake(s_mutex, 0) != pdTRUE) return BLE_ATT_ERR_INSUFFICIENT_RES;
    int rc = 0;
    if (ctx->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        rc = os_mbuf_append(ctx->om, s_reply, strlen(s_reply)) ? BLE_ATT_ERR_INSUFFICIENT_RES : 0;
    } else if (ctx->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        uint8_t bytes[512];
        uint16_t length;
        rc = ble_hs_mbuf_to_flat(ctx->om, bytes, sizeof(bytes), &length);
        if (!rc) {
            for (unsigned i = 0; i < length; ++i) {
                life_remote_seed_t seed;
                life_wire_result_t result = life_wire_feed(&s_wire, bytes[i], esp_timer_get_time() / 1000, &seed);
                if (result == LIFE_WIRE_SEED) {
                    if (xQueueSend(s_seeds, &seed, 0) != pdTRUE) reply_locked(seed.id, NULL, "busy", 0, 0);
                    else reply_locked(seed.id, "processing", NULL, 0, seed.crc);
                } else if (result < 0) reply_locked(0, NULL, life_wire_error(result), 0, 0);
            }
        } else rc = BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    } else rc = BLE_ATT_ERR_UNLIKELY;
    xSemaphoreGive(s_mutex);
    return rc;
}

static const struct ble_gatt_svc_def s_services[] = {
    { .type = BLE_GATT_SVC_TYPE_PRIMARY, .uuid = &s_service.u,
      .characteristics = (struct ble_gatt_chr_def[]) {
          { .uuid = &s_rx.u, .access_cb = access_gatt, .flags = BLE_GATT_CHR_F_WRITE },
          { .uuid = &s_tx.u, .access_cb = access_gatt,
            .flags = BLE_GATT_CHR_F_NOTIFY, .val_handle = &s_tx_handle },
          { .uuid = &s_status.u, .access_cb = access_gatt, .flags = BLE_GATT_CHR_F_READ },
          {0}
      } },
    {0}
};

static int gap_event(struct ble_gap_event *event, void *arg);
static void advertise(void) {
    if (!s_active) return;
    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128 = (ble_uuid128_t *)&s_service;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;
    check(ble_gap_adv_set_fields(&fields), "advertising service");
    struct ble_hs_adv_fields scan = {0};
    scan.name = (uint8_t *)"LifePassport";
    scan.name_len = strlen((char *)scan.name);
    scan.name_is_complete = 1;
    check(ble_gap_adv_rsp_set_fields(&scan), "scan response");
    struct ble_gap_adv_params params = {0};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    check(ble_gap_adv_start(s_addr_type, NULL, BLE_HS_FOREVER, &params, gap_event, NULL), "advertise");
}

static int gap_event(struct ble_gap_event *event, void *arg) {
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (!event->connect.status) {
            s_connection = event->connect.conn_handle;
            s_connected = true;
            ESP_LOGI(TAG, "phone connected");
        } else advertise();
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        s_connected = s_subscribed = false;
        s_connection = BLE_HS_CONN_HANDLE_NONE;
        xSemaphoreTake(s_mutex, portMAX_DELAY);
        memset(&s_wire, 0, sizeof(s_wire));
        xSemaphoreGive(s_mutex);
        ESP_LOGI(TAG, "phone disconnected");
        advertise();
        break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_tx_handle) {
            s_subscribed = event->subscribe.cur_notify;
            s_dirty = true;
        }
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE: advertise(); break;
    default: break;
    }
    return 0;
}

static void on_sync(void) {
    check(ble_hs_util_ensure_addr(0), "address");
    check(ble_hs_id_infer_auto(0, &s_addr_type), "address type");
    advertise();
}

static void host_task(void *arg) {
    (void)arg;
    nimble_port_run();
    xSemaphoreGive(s_stopped);
    for (;;) vTaskSuspend(NULL);
}

esp_err_t life_ble_init(void) {
    ESP_ERROR_CHECK(nvs_flash_init());
    s_mutex = xSemaphoreCreateMutex();
    s_stopped = xSemaphoreCreateBinary();
    s_seeds = xQueueCreate(2, sizeof(life_remote_seed_t));
    if (!s_mutex || !s_stopped || !s_seeds) return ESP_ERR_NO_MEM;
    esp_err_t error = nimble_port_init();
    if (error != ESP_OK) return error;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    check(ble_svc_gap_device_name_set("LifePassport"), "device name");
    check(ble_gatts_count_cfg(s_services), "GATT count");
    check(ble_gatts_add_svcs(s_services), "GATT registration");
    char uuid[BLE_UUID_STR_LEN];
    ESP_LOGI(TAG, "control service %s", ble_uuid_to_str(&s_service.u, uuid));
    ble_hs_cfg.sync_cb = on_sync;
    s_active = true;
    if (xTaskCreate(host_task, "life_ble", 4096, NULL, configMAX_PRIORITIES - 4, &s_host) != pdPASS)
        return ESP_ERR_NO_MEM;
    return ESP_OK;
}

bool life_ble_connected(void) { return s_connected; }
bool life_ble_take(life_remote_seed_t *seed) { return xQueueReceive(s_seeds, seed, 0) == pdTRUE; }

void life_ble_tick(uint64_t now_ms) {
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    if (life_wire_expire(&s_wire, now_ms)) reply_locked(0, NULL, "timeout", 0, 0);
    xSemaphoreGive(s_mutex);
    if (s_connected && s_subscribed && atomic_exchange(&s_dirty, false)) {
        /* Separate notification and read characteristics: CoreBluetooth shares
           their delegate callback when both operations use one characteristic. */
        struct os_mbuf *buffer = ble_hs_mbuf_from_flat("changed", 7);
        if (!buffer) { s_dirty = true; return; }
        int rc = ble_gatts_notify_custom((uint16_t)s_connection, s_tx_handle, buffer);
        if (rc && s_connected) { ESP_LOGW(TAG, "notify retry rc=%d", rc); s_dirty = true; }
    }
}

esp_err_t life_ble_stop(void) {
    s_active = false;
    int rc = ble_gap_adv_stop();
    if (rc && rc != BLE_HS_EALREADY) return ESP_FAIL;
    rc = nimble_port_stop();
    if (rc) return ESP_FAIL;
    if (xSemaphoreTake(s_stopped, pdMS_TO_TICKS(2000)) != pdTRUE) return ESP_ERR_TIMEOUT;
    vTaskDelete(s_host);
    return nimble_port_deinit();
}
