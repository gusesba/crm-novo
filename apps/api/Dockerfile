FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY apps/api/Crm.Api.csproj apps/api/
RUN dotnet restore apps/api/Crm.Api.csproj
COPY apps/api apps/api
RUN dotnet publish apps/api/Crm.Api.csproj -c Release -o /app --no-restore
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /app/data && chown -R app:app /app
USER app
ENV ASPNETCORE_URLS=http://+:5080
EXPOSE 5080
ENTRYPOINT ["dotnet", "Crm.Api.dll"]
