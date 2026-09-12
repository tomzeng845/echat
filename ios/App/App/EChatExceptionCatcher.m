#import "EChatExceptionCatcher.h"

@implementation EChatExceptionCatcher

+ (BOOL)execute:(NS_NOESCAPE void (^)(void))block
  exceptionError:(NSError * _Nullable * _Nullable)exceptionError {
    @try {
        block();
        return YES;
    } @catch (NSException *exception) {
        if (exceptionError != NULL) {
            NSMutableDictionary *userInfo = [NSMutableDictionary dictionary];
            userInfo[NSLocalizedDescriptionKey] = exception.reason ?: @"Objective-C exception";
            userInfo[@"exceptionName"] = exception.name ?: @"UnknownException";
            if (exception.callStackSymbols != nil) {
                userInfo[@"callStackSymbols"] = exception.callStackSymbols;
            }
            *exceptionError = [NSError errorWithDomain:@"com.tomzeng845.echat.avcapture.exception"
                                                   code:1
                                               userInfo:userInfo];
        }
        return NO;
    }
}

@end
