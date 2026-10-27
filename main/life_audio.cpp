#include "life_audio.h"
#include "life_audio_protocol.h"
extern "C" {
#include "bsp_audio.h"
}
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "ggwave/ggwave.h"
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <new>

static const char *TAG = "life_audio";
static SemaphoreHandle_t s_lock, s_done;
static QueueHandle_t s_seeds;
static TaskHandle_t s_task;
static std::atomic<bool> s_stop{false}, s_clear{false};
static life_audio_view_t s_view;
static esp_err_t s_cleanup;

static void publish(const life_audio_view_t &view) {
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s_view = view;
    xSemaphoreGive(s_lock);
}

static void capture_task(void *) {
    life_audio_view_t view = {};
    view.dbfs = -96;
    view.state = LIFE_CAPTURE_STARTING;
    publish(view);
    esp_err_t error = ESP_OK;
    GGWave *receiver = nullptr;
    int16_t samples[512];
    uint8_t last[16] = {};
    bool has_last = false;
    int64_t next_metrics = 0;
    view.stage = 1;
    error = bsp_audio_wake();
    if (error == ESP_OK) error = bsp_audio_set_format(24000, 16, 1);
    if (error == ESP_OK) {
        view.stage = 2;
        GGWave::setLogFile(nullptr);
        GGWave::Protocols::rx().disableAll();
        GGWave::Protocols::rx().toggle(GGWAVE_PROTOCOL_AUDIBLE_FASTEST, true);
        GGWave::Protocols::rx().toggle(GGWAVE_PROTOCOL_DT_FASTEST, true);
        receiver = new (std::nothrow) GGWave;
        if (!receiver) error = ESP_ERR_NO_MEM;
        else {
            auto parameters = GGWave::getDefaultParameters();
            parameters.payloadLength = LIFE_AUDIO_FRAME_SIZE;
            parameters.sampleRateInp = parameters.sampleRateOut = parameters.sampleRate = 24000;
            parameters.samplesPerFrame = 512;
            parameters.sampleFormatInp = GGWAVE_SAMPLE_FORMAT_I16;
            parameters.operatingMode = GGWAVE_OPERATING_MODE_RX | GGWAVE_OPERATING_MODE_USE_DSS;
            if (!receiver->prepare(parameters)) error = ESP_ERR_NO_MEM;
            else view.decoder_heap = receiver->heapSize();
        }
    }
    if (error == ESP_OK) {
        view.state = LIFE_CAPTURE_LISTENING;
        view.stage = 0;
        ESP_LOGI(TAG, "RX ready: 24000Hz/16bit/512; 16B; audible+DT fastest; decoder_heap=%lu",
                 (unsigned long)view.decoder_heap);
        publish(view);
    }
    while (error == ESP_OK && !s_stop.load()) {
        if (s_clear.exchange(false)) {
            view.valid = view.rejected = view.duplicates = 0;
            view.seq = 0;
            view.payload[0] = view.key[0] = 0;
            view.max_decode_us = 0;
            has_last = false;
        }
        error = bsp_audio_read(samples, sizeof(samples));
        if (error != ESP_OK) { view.stage = 3; break; }
        int64_t before = esp_timer_get_time();
        uint64_t sum = 0;
        unsigned clipped = 0;
        for (int16_t sample : samples) {
            sum += (int64_t)sample * sample;
            clipped += sample >= 32760 || sample <= -32760;
        }
        float rms = std::sqrt((float)sum / 512) / 32768.0f;
        view.dbfs = rms > 0 ? 20.0f * std::log10(rms) : -96;
        view.clipped_percent = clipped * 100 / 512;
        if (!receiver->decode(samples, sizeof(samples))) { error = ESP_FAIL; view.stage = 4; break; }
        GGWave::Spectrum spectrum;
        if (receiver->rxTakeSpectrum(spectrum)) {
            unsigned peak = 1;
            for (unsigned i = 2; i < 512 / 2; ++i) if (spectrum[i] > spectrum[peak]) peak = i;
            view.frequency_hz = view.dbfs > -75 ? peak * 24000 / 512 : 0;
        }
        GGWave::TxRxData data;
        int size = receiver->rxTakeData(data);
        if (size > 0) {
            life_audio_packet_t packet;
            life_audio_result_t result = life_audio_packet_decode(data.data(), size, &packet);
            if (result < 0) ++view.rejected;
            else {
                ++view.valid;
                view.seq = packet.seq;
                for (unsigned i = 0; i < 7; ++i) std::snprintf(view.payload + 2 * i, 3, "%02X", packet.payload[i]);
                bool repeated = has_last && !std::memcmp(last, data.data(), 16);
                view.duplicates += repeated;
                std::memcpy(last, data.data(), 16);
                has_last = true;
                ESP_LOGI(TAG, "CRC PASS seq=%u kind=%s data=%s duplicates=%lu", packet.seq,
                         result == LIFE_AUDIO_KEY ? "key" : "diag", view.payload, (unsigned long)view.duplicates);
                if (result == LIFE_AUDIO_KEY && !repeated) {
                    life_key_format(packet.key, view.key);
                    if (xQueueSend(s_seeds, &packet.seed, 0) != pdTRUE) { error = ESP_ERR_NO_MEM; view.stage = 5; break; }
                }
            }
        } else if (size < 0) ++view.rejected;
        uint32_t elapsed = (uint32_t)(esp_timer_get_time() - before);
        if (elapsed > view.max_decode_us) view.max_decode_us = elapsed;
        publish(view);
        if (esp_timer_get_time() >= next_metrics) {
            next_metrics = esp_timer_get_time() + 30000000;
            ESP_LOGI(TAG, "RX metrics: peak=%luHz max_decode_us=%lu stack=%u valid=%lu rejected=%lu duplicates=%lu",
                     (unsigned long)view.frequency_hz, (unsigned long)view.max_decode_us,
                     (unsigned)uxTaskGetStackHighWaterMark(nullptr), (unsigned long)view.valid,
                     (unsigned long)view.rejected, (unsigned long)view.duplicates);
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    delete receiver;
    s_cleanup = bsp_audio_sleep();
    if (error == ESP_OK && s_cleanup != ESP_OK) { error = s_cleanup; view.stage = 6; }
    view.error = error;
    view.state = error == ESP_OK ? LIFE_CAPTURE_OFF : LIFE_CAPTURE_FAILED;
    publish(view);
    if (error != ESP_OK) ESP_LOGE(TAG, "capture terminated: stage=%u error=%s", view.stage, esp_err_to_name(error));
    xSemaphoreGive(s_done);
    for (;;) vTaskSuspend(nullptr);
}

esp_err_t life_audio_init(void) {
    s_lock = xSemaphoreCreateMutex();
    s_done = xSemaphoreCreateBinary();
    s_seeds = xQueueCreate(1, sizeof(life_remote_seed_t));
    return s_lock && s_done && s_seeds ? ESP_OK : ESP_ERR_NO_MEM;
}

esp_err_t life_audio_start(void) {
    if (s_task) return ESP_ERR_INVALID_STATE;
    s_stop = false;
    s_clear = false;
    s_cleanup = ESP_OK;
    xSemaphoreTake(s_done, 0);
    xQueueReset(s_seeds);
    life_audio_view_t starting = {};
    starting.state = LIFE_CAPTURE_STARTING;
    starting.dbfs = -96;
    publish(starting);
    if (xTaskCreate(capture_task, "life_audio", 8192, nullptr, 5, &s_task) != pdPASS) {
        starting.state = LIFE_CAPTURE_FAILED;
        starting.error = ESP_ERR_NO_MEM;
        starting.stage = 7;
        publish(starting);
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

esp_err_t life_audio_stop(void) {
    if (!s_task) return ESP_OK;
    s_stop = true;
    if (xSemaphoreTake(s_done, pdMS_TO_TICKS(3000)) != pdTRUE) return ESP_ERR_TIMEOUT;
    vTaskDelete(s_task);
    s_task = nullptr;
    return s_cleanup;
}

bool life_audio_started(void) { return s_task != nullptr; }
void life_audio_snapshot(life_audio_view_t *view) {
    xSemaphoreTake(s_lock, portMAX_DELAY);
    *view = s_view;
    xSemaphoreGive(s_lock);
}
void life_audio_clear(void) {
    s_clear = true;
    xSemaphoreTake(s_lock, portMAX_DELAY);
    s_view.valid = s_view.rejected = s_view.duplicates = s_view.max_decode_us = 0;
    s_view.seq = 0;
    s_view.payload[0] = s_view.key[0] = 0;
    xSemaphoreGive(s_lock);
}
bool life_audio_take(life_remote_seed_t *seed) { return xQueueReceive(s_seeds, seed, 0) == pdTRUE; }
