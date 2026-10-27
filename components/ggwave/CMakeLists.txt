if(NOT EXISTS "${CMAKE_CURRENT_LIST_DIR}/upstream/src/ggwave.cpp")
    message(FATAL_ERROR "Initialize the pinned GGWave dependency: git submodule update --init --recursive")
endif()
idf_component_register(SRCS "upstream/src/ggwave.cpp"
    INCLUDE_DIRS "upstream/include" "upstream/src")
target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_11)
target_compile_definitions(${COMPONENT_LIB} PRIVATE GGWAVE_DISABLE_LOG)
target_compile_options(${COMPONENT_LIB} PRIVATE -O2)
