#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface EChatExceptionCatcher : NSObject

+ (NSDictionary<NSString *, id> * _Nullable)captureException:(NS_NOESCAPE void (^)(void))block;

@end

NS_ASSUME_NONNULL_END
