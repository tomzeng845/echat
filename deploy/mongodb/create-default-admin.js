// E聊默认后台管理员账号初始化脚本
// 用法：mongosh "$env:MONGODB_URI" --file .\create-default-admin.js
// 说明：登录账号会按 API 规则规范化为小写：E-Admin -> e-admin。

const account = "e-admin";
const passwordHash = "AQAAAAIAAYagAAAAEAAAACALuc3AAoUEydSbsjgO0nmud8jHmfRW1INmypPSq09ainNWPT2A41RLjqDKAlHnRAA=";
const now = new Date();
const users = db.getSiblingDB("echat").getCollection("users");

const result = users.updateOne(
  { Account: account },
  {
    $set: {
      Account: account,
      PasswordHash: passwordHash,
      DisplayName: "E聊管理员",
      Role: 3,
      Status: 0,
      AccountLocked: false,
      LoginLocked: false,
      CancellationEnabled: false,
      FailedLoginAttempts: 0,
      LockoutUntilUtc: null,
      RegistrationSource: "系统初始化",
      AgreementVersion: "2026-09",
      AgreementAcceptedAtUtc: now,
      LastSeenAtUtc: now,
      LoginPasswordChangedAtUtc: now
    },
    $setOnInsert: {
      _id: UUID().toString().replace(/-/g, ""),
      AvatarUrl: "",
      Signature: "E聊系统管理账号",
      Region: "",
      MobilePhone: "",
      PublicKeyJwk: "",
      DevicePublicKeys: {},
      RiskLevel1: 0,
      RiskLevel2: 0,
      AccountBalance: Decimal128("0"),
      FrozenBalance: Decimal128("0"),
      BankCardLocked: false,
      RealNameVerified: false,
      EnterpriseVerified: false,
      RedFlagged: false,
      InviteSource: "",
      LoginIpRestriction: "",
      LastLoginAtUtc: null,
      LastLoginAddress: "",
      LastLoginIp: "",
      LastOnlineIp: "",
      LastNodeIp: "",
      CreatedAtUtc: now
    }
  },
  { upsert: true }
);

printjson({
  acknowledged: result.acknowledged,
  matchedCount: result.matchedCount,
  modifiedCount: result.modifiedCount,
  upsertedId: result.upsertedId,
  account: account,
  role: "Admin",
  passwordReset: true
});
print("管理员账号已创建或更新：e-admin（原始输入：E-Admin）");
print("请登录后立即修改密码，并配置管理员 TOTP 保护。");
