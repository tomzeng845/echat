using System.Security.Cryptography;
using System.Text;
using MongoDB.Bson;
using MongoDB.Driver;

if (args.Length == 0 || args.Any(x => x is "-h" or "--help"))
{
    Console.WriteLine("用法：AdminTotpRecovery.exe account1 account2");
    Console.WriteLine("说明：直接为指定管理员账号生成独立 TOTP 密钥，不修改密码和角色。");
    return;
}

var uri = Environment.GetEnvironmentVariable("MONGODB_URI");
var databaseName = Environment.GetEnvironmentVariable("MONGODB_DATABASE") ?? "echat";
var encryptionKey = Environment.GetEnvironmentVariable("ADMIN_SECRET_ENCRYPTION_KEY")
    ?? Environment.GetEnvironmentVariable("ADMIN_SECRET_KEY")
    ?? Environment.GetEnvironmentVariable("JWT_SECRET");
if (string.IsNullOrWhiteSpace(uri)) throw new InvalidOperationException("未找到 MONGODB_URI，请先加载生产环境变量。");
if (string.IsNullOrWhiteSpace(encryptionKey)) throw new InvalidOperationException("未找到 ADMIN_SECRET_ENCRYPTION_KEY、ADMIN_SECRET_KEY 或 JWT_SECRET。");

Console.WriteLine($"数据库：{databaseName}");
Console.WriteLine($"目标账号：{string.Join(", ", args)}");
Console.Write("确认生成新动态密码并覆盖这几个账号的 TOTP 密钥？输入 YES 继续：");
if (!string.Equals(Console.ReadLine(), "YES", StringComparison.Ordinal)) { Console.WriteLine("已取消，没有修改任何数据。"); return; }

var directConnection = Environment.GetEnvironmentVariable("MONGODB_DIRECT_CONNECTION");
if (string.IsNullOrWhiteSpace(directConnection)) directConnection = "true";
var settings = MongoClientSettings.FromConnectionString(uri);
if (bool.TryParse(directConnection, out var useDirectConnection))
    settings.DirectConnection = useDirectConnection;
var client = new MongoClient(settings);
var db = client.GetDatabase(databaseName);
var users = db.GetCollection<BsonDocument>("users");
var records = db.GetCollection<BsonDocument>("adminModuleRecords");
var now = DateTime.UtcNow;
var key = SHA256.HashData(Encoding.UTF8.GetBytes(encryptionKey));

foreach (var rawAccount in args)
{
    var account = rawAccount.Trim().ToLowerInvariant();
    var user = await users.Find(Builders<BsonDocument>.Filter.Eq("Account", account)).FirstOrDefaultAsync()
        ?? await users.Find(Builders<BsonDocument>.Filter.Eq("account", account)).FirstOrDefaultAsync();
    if (user is null) { Console.WriteLine($"跳过 @{account}：账号不存在。"); continue; }

    var id = user.GetValue("_id").ToString();
    var role = user.GetValue("Role", user.GetValue("role", "")).ToString();
    if (!role.Equals("Admin", StringComparison.OrdinalIgnoreCase) && role != "3") { Console.WriteLine($"跳过 @{account}：不是管理员账号（Role={role}）。"); continue; }

    var secret = GenerateSecret();
    var cipher = Protect(secret, key);
    var record = new BsonDocument
    {
        ["_id"] = $"totp:{id}",
        ["Module"] = "system.admin-totp",
        ["Name"] = account,
        ["Status"] = "Active",
        ["Data"] = new BsonDocument { ["userId"] = id, ["secretCiphertext"] = cipher, ["provisionedAtUtc"] = now.ToString("O"), ["recoveryTool"] = "AdminTotpRecovery" },
        ["CreatedAtUtc"] = now,
        ["UpdatedAtUtc"] = now
    };
    await records.ReplaceOneAsync(Builders<BsonDocument>.Filter.Eq("_id", $"totp:{id}"), record, new ReplaceOptions { IsUpsert = true });
    Console.WriteLine();
    Console.WriteLine($"账号：@{account}");
    Console.WriteLine($"新 TOTP 密钥：{secret}");
    Console.WriteLine($"配置 URI：{ProvisioningUri(account, secret)}");
}
Console.WriteLine();
Console.WriteLine("恢复完成。请立即将每个账号的新密钥绑定到验证器，并删除/妥善保护本工具输出。");

static string Protect(string value, byte[] key)
{
    var nonce = RandomNumberGenerator.GetBytes(12);
    var plain = Encoding.UTF8.GetBytes(value);
    var cipher = new byte[plain.Length];
    var tag = new byte[16];
    using var aes = new AesGcm(key, 16);
    aes.Encrypt(nonce, plain, cipher, tag);
    return Convert.ToBase64String([.. nonce, .. tag, .. cipher]);
}

static string GenerateSecret() => Base32Encode(RandomNumberGenerator.GetBytes(20));

static string ProvisioningUri(string account, string secret) =>
    $"otpauth://totp/E%E8%81%8A:{Uri.EscapeDataString(account)}?secret={secret}&issuer=E%E8%81%8A&digits=6&period=30";

static string Base32Encode(byte[] value)
{
    const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var output = new StringBuilder(); var buffer = 0; var bits = 0;
    foreach (var b in value)
    {
        buffer = (buffer << 8) | b; bits += 8;
        while (bits >= 5) { bits -= 5; output.Append(alphabet[(buffer >> bits) & 31]); buffer &= (1 << bits) - 1; }
    }
    if (bits > 0) output.Append(alphabet[(buffer << (5 - bits)) & 31]);
    return output.ToString();
}
