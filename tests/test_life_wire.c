#include "life_wire.h"
#include "cJSON.h"
#include <stdlib.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>

static const char *valid = "{\"v\":1,\"id\":7,\"op\":\"seed\",\"w\":36,\"h\":32,\"rows\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],\"crc\":1879704988,\"interval_ms\":200,\"wrap\":true}";

static void bad_field(const char *key, cJSON *value) {
    cJSON *root = cJSON_Parse(valid);
    assert(root && cJSON_ReplaceItemInObject(root, key, value));
    char *json = cJSON_PrintUnformatted(root);
    life_remote_seed_t seed;
    assert(life_wire_parse(json, &seed) == LIFE_WIRE_INVALID);
    free(json);
    cJSON_Delete(root);
}

int main(int argc, char **argv) {
    assert(argc == 2);
    FILE *file = fopen(argv[1], "rb");
    assert(file);
    char fixtures[16384];
    size_t length = fread(fixtures, 1, sizeof(fixtures) - 1, file);
    assert(!ferror(file) && feof(file));
    fixtures[length] = 0;
    fclose(file);
    cJSON *vectors = cJSON_Parse(fixtures);
    assert(cJSON_IsArray(vectors));
    for (int i = 0; i < cJSON_GetArraySize(vectors); ++i) {
        cJSON *vector = cJSON_GetArrayItem(vectors, i);
        cJSON_DeleteItemFromObject(vector, "name");
        char *json = cJSON_PrintUnformatted(vector);
        life_remote_seed_t seed;
        assert(life_wire_parse(json, &seed) == LIFE_WIRE_SEED);
        free(json);
    }
    cJSON_Delete(vectors);
    bad_field("v", cJSON_CreateNumber(2));
    bad_field("id", cJSON_CreateNumber(0));
    bad_field("id", cJSON_CreateNumber(1.5));
    bad_field("w", cJSON_CreateNumber(35));
    bad_field("h", cJSON_CreateNumber(33));
    bad_field("wrap", cJSON_CreateNumber(1));
    bad_field("interval_ms", cJSON_CreateNumber(250));
    bad_field("rows", cJSON_CreateArray());
    cJSON *duplicate = cJSON_Parse(valid);
    cJSON_AddNumberToObject(duplicate, "id", 8);
    char *duplicate_text = cJSON_PrintUnformatted(duplicate);
    life_remote_seed_t rejected;
    assert(life_wire_parse(duplicate_text, &rejected) == LIFE_WIRE_INVALID);
    free(duplicate_text);
    cJSON_Delete(duplicate);
    life_wire_t wire = {0};
    life_remote_seed_t seed;
    char message[1024];
    snprintf(message, sizeof(message), "%s\n", valid);
    for (size_t i = 0; i < strlen(message); ++i) {
        life_wire_result_t result = life_wire_feed(&wire, message[i], i, &seed);
        if (i + 1 < strlen(message)) assert(result == LIFE_WIRE_MORE);
        else assert(result == LIFE_WIRE_SEED);
    }
    assert(seed.id == 7 && seed.interval_ms == 200 && seed.wrap);
    assert(life_wire_crc(seed.bits) == seed.crc);
    assert(life_wire_parse("{}", &seed) == LIFE_WIRE_INVALID);
    assert(life_wire_parse("[]", &seed) == LIFE_WIRE_INVALID);
    assert(life_wire_parse("[[[[[[[[0]]]]]]]]", &seed) == LIFE_WIRE_INVALID);
    assert(life_wire_parse("{\"v\":1}garbage", &seed) == LIFE_WIRE_INVALID);
    char corrupt[1024];
    strcpy(corrupt, valid);
    char *checksum = strstr(corrupt, "1879704988");
    assert(checksum);
    *checksum = '2';
    assert(life_wire_parse(corrupt, &seed) == LIFE_WIRE_CHECKSUM);
    memset(&wire, 0, sizeof(wire));
    assert(life_wire_feed(&wire, '{', 0, &seed) == LIFE_WIRE_MORE);
    assert(life_wire_expire(&wire, 5001));
    assert(life_wire_feed(&wire, '\n', 5002, &seed) == LIFE_WIRE_TIMEOUT);
    for (int i = 0; i < LIFE_WIRE_CAPACITY + 5; ++i)
        life_wire_feed(&wire, 'x', 5003, &seed);
    assert(life_wire_feed(&wire, '\n', 5004, &seed) == LIFE_WIRE_OVERSIZE);
    assert(life_wire_parse(valid, &seed) == LIFE_WIRE_SEED);
    puts("Life wire framing, validation, CRC and timeout: PASS");
}
