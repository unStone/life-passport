cmake_minimum_required(VERSION 3.20)
project(life_visual C)
set(CMAKE_C_STANDARD 11)
set(APP_ROOT "${CMAKE_CURRENT_LIST_DIR}/../..")
if(NOT EXISTS "${LVGL_ROOT}/lvgl.h")
    message(FATAL_ERROR "Pass -DLVGL_ROOT=<locked LVGL 9.5.0 source directory>")
endif()
file(GLOB_RECURSE LV_SOURCES "${LVGL_ROOT}/src/*.c")
add_library(lvgl_native STATIC ${LV_SOURCES})
set_source_files_properties("${LVGL_ROOT}/src/widgets/canvas/lv_canvas.c"
    PROPERTIES COMPILE_OPTIONS "-finstrument-functions")
target_include_directories(lvgl_native PUBLIC "${LVGL_ROOT}" "${CMAKE_CURRENT_LIST_DIR}")
target_compile_definitions(lvgl_native PUBLIC LV_CONF_INCLUDE_SIMPLE)
add_executable(life_visual life_visual.c
    "${APP_ROOT}/main/life.c" "${APP_ROOT}/main/life_ui.c"
    "${APP_ROOT}/assets/fonts/life_font_16.c"
    "${APP_ROOT}/components/bsp/src/bsp_display_rounding.c")
target_include_directories(life_visual PRIVATE "${APP_ROOT}/main"
    "${APP_ROOT}/components/bsp/src")
target_compile_options(life_visual PRIVATE -Wall -Wextra -Werror -UNDEBUG)
target_link_libraries(life_visual PRIVATE lvgl_native m)
