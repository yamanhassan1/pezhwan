namespace Pezhwan;

/// <summary>Base SDK exception.</summary>
public class PezhwanException : Exception
{
    public PezhwanException(string message) : base(message)
    {
    }

    public PezhwanException(string message, Exception inner) : base(message, inner)
    {
    }
}

/// <summary>A non-2xx response from the identity server.</summary>
public sealed class PezhwanApiException : PezhwanException
{
    public PezhwanApiException(int status, string code, string message)
        : base(message)
    {
        Status = status;
        Code = code;
    }

    public int Status { get; }
    public string Code { get; }

    public bool IsAuthFailure => Status == 401;
    public bool IsRateLimited => Status == 429;

    public override string ToString()
    {
        var detail = string.IsNullOrEmpty(Message) ? "" : $": {Message}";
        return $"pezhwan: HTTP {Status} {Code}{detail}";
    }
}

/// <summary>Wraps network-level failures.</summary>
public sealed class PezhwanNetworkException : PezhwanException
{
    public PezhwanNetworkException(string message, Exception inner) : base(message, inner)
    {
    }
}