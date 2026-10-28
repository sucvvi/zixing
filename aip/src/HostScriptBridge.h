#import <Foundation/Foundation.h>

@interface ZXHostScriptBridge : NSObject
- (instancetype)initWithResources:(NSURL *)resources;
- (id)performAction:(NSString *)action payload:(NSDictionary *)payload error:(NSError **)error;
@end
