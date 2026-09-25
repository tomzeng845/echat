using System.Security.Claims;
using System.Text.RegularExpressions;

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
            _ when Regex.IsMatch(normalized, "^[a-z0-9][a-z0-9_-]{1,39}$") => normalized,
            _ => ""
        };
    }

    public static bool IsTenant(string? value) => Normalize(value) is { Length: > 0 } normalized && normalized != All && normalized != Unassigned;
}

public static class TenantScopeExtensions
{
    public static string AdminTenantScope(this ClaimsPrincipal principal)
    {
        if (!principal.IsInRole(nameof(UserRole.Admin))) return "";
        // e_admin is the built-in platform super administrator. Keep this
        // compatibility path so tokens issued before the bootstrap repair do
        // not lose the ability to switch to a tenant.
        var account = principal.FindFirstValue("unique_name")?.Trim().ToLowerInvariant();
        if (account == "e_admin") return TenantIds.All;
        // A missing claim is treated as the legacy super-admin scope. New tokens
        // always include admin_tenant_scope and therefore cannot inherit this path.
        var scope = TenantIds.Normalize(principal.FindFirstValue("admin_tenant_scope"));
        return string.IsNullOrWhiteSpace(scope) ? TenantIds.All : scope;
    }
}

public sealed class TenantContext(IHttpContextAccessor accessor)
{
    public bool CanSwitchTenant => accessor.HttpContext?.User?.AdminTenantScope() == TenantIds.All;
    public string CurrentAdminScope
    {
        get
        {
            var user = accessor.HttpContext?.User;
            // Login and registration requests do not have a token yet. They
            // must be able to locate an account in its assigned tenant; using
            // the unassigned scope here made tenant users appear nonexistent.
            if (user?.Identity?.IsAuthenticated != true) return TenantIds.All;
            var baseScope = user?.AdminTenantScope() ?? "";
            if (baseScope != TenantIds.All)
            {
                if (!string.IsNullOrWhiteSpace(baseScope)) return baseScope;
                return TenantIds.Normalize(user?.FindFirstValue("tenant_id")) is var userTenant && !string.IsNullOrWhiteSpace(userTenant)
                    ? userTenant
                    : TenantIds.Unassigned;
            }
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
