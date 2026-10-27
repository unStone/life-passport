#pragma once
#include "life.h"
#include "lvgl.h"

/* All calls run in the LVGL task or with the BSP LVGL lock held. */
bool life_ui_font_check(void);
void life_ui_create(const life_app_t *app, int battery);
void life_ui_refresh(const life_app_t *app, int battery);
