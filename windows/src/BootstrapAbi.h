#pragma once
#include <stdint.h>
#include <stddef.h>

// Minimal C-facing registration view. No Adobe SDK implementation or C++ objects
// cross this boundary. tests/sdk-abi-check.cpp validates these offsets using the
// separately obtained official SDK during a local cross build.
typedef int32_t ZXError;
struct ZXBasic {
    ZXError (*AcquireSuite)(const char*, int32_t, const void**);
    ZXError (*ReleaseSuite)(const char*, int32_t);
};
struct ZXMessage {
    int32_t check;
    void* self;
    void* globals;
    ZXBasic* basic;
};
struct ZXMenuMessage { ZXMessage data; void* item; };
struct ZXPlatformMenu { void* menu; int16_t item; };
struct ZXMenu {
    void* unusedAddUnicode;
    ZXError (*AddZString)(void*, const char*, const char*, const void*, int32_t, void**);
    void* unusedSlots2Through7[6];
    ZXError (*GetPlatformItem)(void*, ZXPlatformMenu*);
};
struct ZXAccess { ZXError (*AcquirePlugin)(void*, void**); };
static_assert(sizeof(void*) == 8, "ZiXing requires Windows x64");
static_assert(sizeof(ZXMessage) == 32 && offsetof(ZXMessage, basic) == 24, "Unexpected message layout");
static_assert(offsetof(ZXMenuMessage, item) == 32, "Unexpected menu message layout");
