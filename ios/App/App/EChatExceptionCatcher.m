#import "EChatExceptionCatcher.h"

@implementation EChatExceptionCatcher

+ (NSDictionary<NSString *, id> * _Nullable)captureException:(NS_NOESCAPE void (^)(void))block {
    @try {
        block();
        return nil;
    } @catch (NSException *exception) {
        return @{
            @"message": exception.reason ?: @"Objective-C exception",
            @"exceptionName": exception.name ?: @"UnknownException",
            @"callStackSymbols": exception.callStackSymbols ?: @[]
        };
    }
}

@end
