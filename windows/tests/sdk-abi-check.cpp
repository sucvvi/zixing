#include "../src/LegacyU16Traits.h"
#include "SPBasic.h"
#include "SPAccess.h"
#include "SPMData.h"
#include "AIMenu.h"
#include "AIMenuGroups.h"
#include "../src/BootstrapAbi.h"
static_assert(sizeof(ZXMessage)==sizeof(SPMessageData), "Message size differs from SDK");
static_assert(offsetof(ZXMessage,self)==offsetof(SPMessageData,self), "Self pointer differs");
static_assert(offsetof(ZXMessage,globals)==offsetof(SPMessageData,globals), "Globals pointer differs");
static_assert(offsetof(ZXMessage,basic)==offsetof(SPMessageData,basic), "Basic suite pointer differs");
static_assert(offsetof(ZXMenuMessage,item)==offsetof(AIMenuMessage,menuItem), "Menu message differs");
static_assert(offsetof(ZXMenu,AddZString)==offsetof(AIMenuSuite,AddMenuItemZString), "Menu prefix differs");
static_assert(offsetof(ZXAccess,AcquirePlugin)==offsetof(SPAccessSuite,AcquirePlugin), "Access prefix differs");
static_assert(kAIMenuSuiteVersion==11 && kSPAccessSuiteVersion==3, "Recheck suite versions");
static_assert(kMenuItemAlwaysEnabled==2, "Recheck menu option");
