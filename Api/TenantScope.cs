using System.Security.Claims;

namespace EChat.Api;

public static class TenantIds
{
    public const string Unassigned = "unassigned";
    public const string All = "*";

    public static string Normalize(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant() ?? "";
        return normalized switch
        {
            "a" or "a后台" or "a-backend" => "a",
            "b" or "b后台" or "b-backend" => "b",
            "unassigned" or "未分配" or "未分配/总后台" => Unassigned,
            "*" or "all" or "总后台" => All,
            _ => ""
        };
    }

    public static bool IsTenant(string? value) => Normalize(value) is "a" or "b" or Unassigned;
}

public static class TenantScopeExtensions
{
    public static string AdminTenantScope(this ClaimsPrincipal principal)
    {
        if (!principal.IsInRole(nameof(UserRole.Admin))) return "";
        // A missing claim is treated as the legacy super-admin scope. New tokens
        // always include admin_tenant_scope and therefore cannot inherit this path.
        return TenantIds.Normalize(principal.FindFirstValue("admin_tenant_scope")) switch
        {
            "a" or "b" or TenantIds.Unassigned => principal.FindFirstValue("admin_tenant_scope")!.Trim().ToLowerInvariant(),
            _ => TenantIds.All
        };
    }
}

public sealed class TenantContext(IHttpContextAccessor accessor)
{
    public string CurrentAdminScope
    {
        get
        {
            var user = accessor.HttpContext?.User;
            var baseScope = user?.AdminTenantScope() ?? "";
            if (baseScope != TenantIds.All) return baseScope;
            var requested = TenantIds.Normalize(accessor.HttpContext?.Request.Headers["X-EChat-Tenant"].FirstOrDefault());
            return string.IsNullOrWhiteSpace(requested) ? TenantIds.All : requested;
        }
    }

    public bool IsAdminRequest => !string.IsNullOrWhiteSpace(accessor.HttpContext?.User?.FindFirstValue(ClaimTypes.Role)) && accessor.HttpContext!.User.IsInRole(nameof(UserRole.Admin));
    public bool Includes(string? tenantId)
    {
        if (!IsAdminRequest) return true;
        var scope = CurrentAdminScope;
        var value = string.IsNullOrWhiteSpace(tenantId) ? TenantIds.Unassigned : TenantIds.Normalize(tenantId);
        return scope == TenantIds.All || value == scope;
    }
}

public static class TenantData
{
    public static string NormalizeStored(string? value) => TenantIds.Normalize(value) is var normalized && !string.IsNullOrWhiteSpace(normalized) && normalized != TenantIds.All ? normalized : TenantIds.Unassigned;
}
