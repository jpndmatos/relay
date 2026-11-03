using System.ComponentModel.DataAnnotations;

namespace Relay.Api;

public sealed class ValidationFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        foreach (var argument in context.Arguments.Where(a => a?.GetType().Namespace == typeof(ValidationFilter).Namespace))
        {
            if (argument is null) continue;
            var results = new List<ValidationResult>();
            if (!Validator.TryValidateObject(argument, new ValidationContext(argument), results, true))
                return Results.ValidationProblem(results.SelectMany(r => r.MemberNames.Select(m => (m, r.ErrorMessage)))
                    .GroupBy(r => r.m).ToDictionary(g => g.Key, g => g.Select(r => r.ErrorMessage ?? "Invalid value.").ToArray()));
        }
        return await next(context);
    }
}
