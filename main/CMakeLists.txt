idf_component_register(
    SRCS "main.c"
         "life.c"
         "life_ui.c"
         "life_wire.c"
         "life_ble.c"
         "life_audio.cpp"
         "life_audio_protocol.c"
         "../assets/fonts/life_font_16.c"
    INCLUDE_DIRS "."
    REQUIRES bsp esp_hw_support esp_timer esp_system esp_driver_gpio bt nvs_flash json esp_rom ggwave
)

# This application's JSON contract has object/array depth two. Bound the official
# parser recursion before untrusted BLE input reaches the 4 KB host task stack.
idf_component_get_property(life_json_library json COMPONENT_LIB)
target_compile_definitions(${life_json_library} PRIVATE CJSON_NESTING_LIMIT=4)
