#import <Cocoa/Cocoa.h>

typedef id _Nullable (^ZXHostHandler)(NSString *action, NSDictionary *payload, NSError **error);
// Called on a worker queue. Document operations are delivered to Illustrator's own event loop.

@interface ZXPanelController : NSWindowController
- (instancetype)initWithResources:(NSURL *)resources host:(ZXHostHandler)host;
- (instancetype)initWithContainerView:(NSView *)container resources:(NSURL *)resources host:(ZXHostHandler)host;
- (void)showPanel;
- (void)shutdown;
@end
