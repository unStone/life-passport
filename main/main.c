#include "bsp_audio.h"
#include "bsp_battery.h"
#include "bsp_button.h"
#include "bsp_display.h"
#include "bsp_i2c.h"
#include "bsp_pins.h"
#include "key_guard.h"
#include "life.h"
#include "life_keys.h"
#include "life_ui.h"
#include "life_ble.h"
#include "life_audio.h"
#include "esp_attr.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_sleep.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <stdatomic.h>
#include <stdlib.h>

#define RETAINED_MAGIC 0x4C494632u
#define KEY_GUARD_MAX_US (10LL * 1000 * 1000)
static const char *TAG = "life";
static life_app_t s_app;
static RTC_DATA_ATTR life_app_t s_retained;
static RTC_DATA_ATTR uint32_t s_retained_magic;
static key_guard_t s_key_guard;
static QueueHandle_t s_input_queue;
static atomic_bool s_input_ready, s_queue_failed;
static bool s_battery_available;
typedef struct { bsp_btn_t btn; bsp_btn_ev_t event; } input_event_t;

static uint64_t now_ms(void) { return (uint64_t)esp_timer_get_time() / 1000; }

static void on_key(bsp_btn_t btn, bsp_btn_ev_t event, void *user) {
    (void)user;
    if (key_guard_consume(&s_key_guard, event == BSP_BTN_RELEASE, esp_timer_get_time())) return;
    if (!s_input_ready) return;
    if (event != BSP_BTN_PRESS && event != BSP_BTN_RELEASE && event != BSP_BTN_LONG) return;
    input_event_t input = { btn, event };
    if (xQueueSend(s_input_queue, &input, 0) != pdTRUE) s_queue_failed = true;
}

static void enter_sleep(void) {
    int mv = bsp_button_read_mv();
    ESP_ERROR_CHECK(mv < 0 ? ESP_ERR_INVALID_STATE : ESP_OK);
    if (mv < BSP_BTN_MV_RELEASED_MIN) return;
    ESP_ERROR_CHECK(life_audio_stop());
    ESP_ERROR_CHECK(life_ble_stop());
    /* RTC retention survives sleep, while hardware power-off starts fresh. */
    s_retained = s_app;
    s_retained_magic = RETAINED_MAGIC;
    s_input_ready = false;
    int level;
    ESP_ERROR_CHECK(bsp_button_prepare_deep_sleep(&level));
    ESP_ERROR_CHECK(esp_deep_sleep_enable_gpio_wakeup(
        1ULL << BSP_BTN_GPIO, ESP_GPIO_WAKEUP_GPIO_LOW));
    ESP_ERROR_CHECK(bsp_battery_sleep());
    ESP_ERROR_CHECK(bsp_audio_sleep());
    ESP_ERROR_CHECK(bsp_audio_prepare_deep_sleep());
    ESP_ERROR_CHECK(bsp_i2c_prepare_deep_sleep());
    ESP_ERROR_CHECK(bsp_lvgl_lock(1000) ? ESP_OK : ESP_ERR_TIMEOUT);
    ESP_ERROR_CHECK(bsp_display_prepare_deep_sleep());
    ESP_LOGI(TAG, "paused state retained; deep sleep, any key wakes (level=%d)", level);
    esp_deep_sleep_start();
    abort();
}

static void app_task(void *arg) {
    (void)arg;
    life_keys_t keys = {0};
    input_event_t input;
    int battery = s_battery_available ? bsp_battery_soc() : -1;
    uint64_t next_battery = now_ms() + 30000;
    uint64_t max_ui_us = 0;
    life_idle_t previous_idle = LIFE_BRIGHT;
    life_remote_status_t published_status = LIFE_REMOTE_NONE;
    uint32_t published_id = 0;
    uint64_t next_audio_ui = 0;
    for (;;) {
        bool dirty = false;
        if (xQueueReceive(s_input_queue, &input, pdMS_TO_TICKS(20)) == pdTRUE) {
            life_key_event_t event = input.event == BSP_BTN_PRESS ? LIFE_KEY_PRESS :
                                     input.event == BSP_BTN_LONG ? LIFE_KEY_LONG : LIFE_KEY_RELEASE;
            int action = life_keys_feed(&keys, input.btn, event);
            if (action >= 0) {
                bool wake_only = life_app_input(&s_app, action, now_ms());
                if (!wake_only && s_app.page == LIFE_LINK && action == LIFE_DOWN) life_audio_clear();
                ESP_LOGI(TAG, "key action=%d page=%d wake_only=%d", action, s_app.page, wake_only);
                dirty = true;
            }
        }
        ESP_ERROR_CHECK(atomic_exchange(&s_queue_failed, false) ? ESP_ERR_NO_MEM : ESP_OK);
        uint64_t now = now_ms();
        life_remote_seed_t seed;
        bool from_audio = false;
        bool received = life_ble_take(&seed);
        if (!received) { received = life_audio_take(&seed); from_audio = received; }
        if (received) {
            life_remote_result_t result = life_app_receive(&s_app, &seed, now);
            if (result == LIFE_REMOTE_BUSY || result == LIFE_REMOTE_CONFLICT) {
                if (!from_audio) life_ble_reply(seed.id, NULL, result == LIFE_REMOTE_BUSY ? "busy" : "id_conflict", 0, 0);
            }
            else {
                if (result == LIFE_REMOTE_NEW) keys = (life_keys_t){0};
                published_id = 0;
                dirty = true;
            }
        }
        if (s_app.remote_id && (published_id != s_app.remote_id || published_status != s_app.remote_status)) {
            const char *state = s_app.remote_status == LIFE_REMOTE_PREVIEW ? "preview" :
                                s_app.remote_status == LIFE_REMOTE_APPLIED ? "applied" : "cancelled";
            life_ble_reply(s_app.remote_id, state, NULL, s_app.game.population, s_app.remote_crc);
            published_id = s_app.remote_id;
            published_status = s_app.remote_status;
            ESP_LOGI(TAG, "remote id=%lu state=%s population=%u",
                     (unsigned long)s_app.remote_id, state, s_app.game.population);
        }
        bool connected = life_ble_connected();
        if (connected != s_app.phone_connected) { s_app.phone_connected = connected; dirty = true; }
        bool want_audio = s_app.page == LIFE_LINK && s_app.audio_requested;
        if (want_audio && !life_audio_started()) {
            esp_err_t started = life_audio_start();
            if (started != ESP_OK) s_app.audio_requested = false;
            dirty = true;
        } else if (!want_audio && life_audio_started()) {
            ESP_ERROR_CHECK(life_audio_stop());
            dirty = true;
        }
        life_audio_view_t audio;
        life_audio_snapshot(&audio);
        if (audio.state == LIFE_CAPTURE_FAILED && s_app.audio_requested) {
            s_app.audio_requested = false;
            ESP_ERROR_CHECK(life_audio_stop());
            dirty = true;
        }
        if (s_app.page == LIFE_LINK && now >= next_audio_ui) {
            next_audio_ui = now + 250;
            dirty = true;
        }
        life_ble_tick(now);
        dirty |= life_app_tick(&s_app, now);
        if (now >= next_battery) {
            int current = s_battery_available ? bsp_battery_soc() : -1;
            dirty |= current != battery;
            battery = current;
            next_battery = now + 30000;
            ESP_LOGI(TAG, "generation=%llu page=%d idle=%d connected=%d ui_max_us=%llu heap free=%u min=%u largest=%u stack=%u",
                     (unsigned long long)s_app.game.generation,
                     s_app.page, life_app_idle(&s_app, now), connected, (unsigned long long)max_ui_us,
                     (unsigned)esp_get_free_heap_size(), (unsigned)esp_get_minimum_free_heap_size(),
                     (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT),
                     (unsigned)uxTaskGetStackHighWaterMark(NULL));
        }
        life_idle_t idle = life_app_idle(&s_app, now);
        if (idle != previous_idle) {
            bsp_display_backlight(idle >= LIFE_BLANK ? 0 : idle == LIFE_DIM ? 12 : 65);
            previous_idle = idle;
        }
        if (idle == LIFE_SLEEP) enter_sleep();
        if (dirty) {
            int64_t before_ui = esp_timer_get_time();
            ESP_ERROR_CHECK(bsp_lvgl_lock(1000) ? ESP_OK : ESP_ERR_TIMEOUT);
            life_ui_audio_update(&audio);
            life_ui_refresh(&s_app, battery);
            bsp_lvgl_unlock();
            uint64_t elapsed = (uint64_t)(esp_timer_get_time() - before_ui);
            if (elapsed > max_ui_us) max_ui_us = elapsed;
        }
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Life B3/S23, %dx%d; BLE control v1", LIFE_COLS, LIFE_ROWS);
    bool key_wake = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_GPIO;
    if (key_wake) key_guard_arm(&s_key_guard, esp_timer_get_time(), KEY_GUARD_MAX_US);
    if (key_wake && s_retained_magic == RETAINED_MAGIC) {
        s_app = s_retained;
        s_app.last_input_ms = s_app.last_step_ms = now_ms();
    } else life_app_init(&s_app, esp_random(), now_ms());
    s_retained_magic = 0;
    ESP_ERROR_CHECK(bsp_i2c_init());
    ESP_ERROR_CHECK(bsp_display_init());
    ESP_ERROR_CHECK(bsp_lvgl_init() ? ESP_OK : ESP_ERR_NO_MEM);
    ESP_ERROR_CHECK(bsp_audio_init());
    ESP_ERROR_CHECK(bsp_audio_sleep());
    esp_err_t battery_err = bsp_battery_init();
    if (battery_err != ESP_OK && battery_err != ESP_ERR_NOT_FOUND) ESP_ERROR_CHECK(battery_err);
    s_battery_available = battery_err == ESP_OK;
    s_input_queue = xQueueCreate(32, sizeof(input_event_t));
    ESP_ERROR_CHECK(s_input_queue ? ESP_OK : ESP_ERR_NO_MEM);
    ESP_ERROR_CHECK(bsp_button_init(on_key, NULL));
    ESP_ERROR_CHECK(life_ble_init());
    ESP_ERROR_CHECK(life_audio_init());
#ifdef CONFIG_LIFE_ACOUSTIC_LAB_BOOT
    if (!key_wake) { s_app.page = LIFE_LINK; s_app.running = false; s_app.audio_requested = true; }
#endif
    s_app.phone_connected = false;
    if (s_key_guard.armed)
        key_guard_sync_released(&s_key_guard, bsp_button_read_mv() >= BSP_BTN_MV_RELEASED_MIN);
    s_app.last_input_ms = s_app.last_step_ms = now_ms();
    ESP_ERROR_CHECK(bsp_lvgl_lock(1000) ? ESP_OK : ESP_ERR_TIMEOUT);
    ESP_ERROR_CHECK(life_ui_font_check() ? ESP_OK : ESP_ERR_INVALID_STATE);
    life_ui_create(&s_app, s_battery_available ? bsp_battery_soc() : -1);
    lv_mem_monitor_t pool;
    lv_mem_monitor(&pool);
    ESP_LOGI(TAG, "font coverage PASS; LVGL pool free=%u max_used=%u",
             (unsigned)pool.free_size, (unsigned)pool.max_used);
    bsp_lvgl_unlock();
    bsp_display_backlight(65);
    ESP_ERROR_CHECK(xTaskCreate(app_task, "life", 6144, NULL, 4, NULL) == pdPASS ? ESP_OK : ESP_ERR_NO_MEM);
    s_input_ready = true;
}
