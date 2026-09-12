#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface EChatExceptionCatcher : NSObject

+ (BOOL)execute:(NS_NOESCAPE void (^)(void))block
  exceptionError:(NSError * _Nullable * _Nullable)exceptionError
  NS_SWIFT_NAME(execute(_:exceptionError:));

@end

NS_ASSUME_NONNULL_END
