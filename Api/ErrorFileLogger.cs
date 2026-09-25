using System.Text;
using Microsoft.Extensions.Logging;

namespace EChat.Api;

/// <summary>
/// Writes only Error and Critical logs to the application directory's Logs folder.
/// A new file is created before a write would exceed the configured maximum size.
/// </summary>
public sealed class ErrorFileLoggerProvider : ILoggerProvider
{
    private readonly string directory;
    private readonly long maxFileBytes;
    private readonly object sync = new();
    private readonly Dictionary<string, ErrorFileLogger> loggers = new(StringComparer.Ordinal);
    private bool disposed;

    public ErrorFileLoggerProvider(string directory, long maxFileBytes)
    {
        this.directory = directory;
        this.maxFileBytes = maxFileBytes;
        Directory.CreateDirectory(directory);
    }

    public ILogger CreateLogger(string categoryName)
    {
        lock (sync)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            if (!loggers.TryGetValue(categoryName, out var logger))
            {
                logger = new ErrorFileLogger(categoryName, directory, maxFileBytes, sync);
                loggers[categoryName] = logger;
            }
            return logger;
        }
    }

    public void Dispose()
    {
        lock (sync)
        {
            disposed = true;
            loggers.Clear();
        }
    }

    private sealed class ErrorFileLogger(string categoryName, string directory, long maxFileBytes, object sync) : ILogger
    {
        public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel) || formatter is null) return;
            var message = formatter(state, exception);
            var builder = new StringBuilder();
            builder.Append(DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz"));
            builder.Append(" [").Append(logLevel).Append("] ");
            builder.Append(categoryName);
            if (eventId.Id != 0 || !string.IsNullOrWhiteSpace(eventId.Name)) builder.Append(" (EventId=").Append(eventId.Id).Append(", ").Append(eventId.Name).Append(')');
            builder.AppendLine();
            builder.AppendLine(message);
            if (exception is not null)
            {
                builder.AppendLine("Exception:");
                builder.AppendLine(exception.ToString());
            }
            builder.AppendLine(new string('-', 100));
            var bytes = Encoding.UTF8.GetBytes(builder.ToString());
            lock (sync)
            {
                Directory.CreateDirectory(directory);
                var path = FindWritableFile(bytes.Length);
                using var stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite, 64 * 1024, FileOptions.SequentialScan);
                stream.Write(bytes, 0, bytes.Length);
            }
        }

        private string FindWritableFile(int incomingBytes)
        {
            var date = DateTime.Now.ToString("yyyyMMdd");
            var prefix = Path.Combine(directory, $"errors-{date}-");
            var files = Directory.EnumerateFiles(directory, $"errors-{date}-*.log")
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToList();
            var next = files.Count == 0 ? 1 : files.Select(path => ParseSequence(path, prefix)).Max();
            if (files.Count == 0) return $"{prefix}{next:000}.log";
            var current = files[^1];
            var currentLength = new FileInfo(current).Length;
            return currentLength > 0 && currentLength + incomingBytes > maxFileBytes
                ? $"{prefix}{next + 1:000}.log"
                : current;
        }

        private static int ParseSequence(string path, string prefix)
        {
            var name = Path.GetFileNameWithoutExtension(path);
            var filePrefix = Path.GetFileName(prefix);
            if (!name.StartsWith(filePrefix, StringComparison.OrdinalIgnoreCase)) return 0;
            var sequence = name[filePrefix.Length..];
            return int.TryParse(sequence, out var value) ? value : 0;
        }
    }

    private sealed class NullScope : IDisposable
    {
        public static readonly NullScope Instance = new();
        public void Dispose() { }
    }
}
