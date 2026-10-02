using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Crm.Api.Migrations
{
    /// <inheritdoc />
    public partial class LeadClassifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Classifications",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Color = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Classifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Classifications_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LeadClassifications",
                columns: table => new
                {
                    ClassificationId = table.Column<int>(type: "INTEGER", nullable: false),
                    LeadId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeadClassifications", x => new { x.ClassificationId, x.LeadId });
                    table.ForeignKey(
                        name: "FK_LeadClassifications_Classifications_ClassificationId",
                        column: x => x.ClassificationId,
                        principalTable: "Classifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_LeadClassifications_Leads_LeadId",
                        column: x => x.LeadId,
                        principalTable: "Leads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Classifications_UserId",
                table: "Classifications",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_LeadClassifications_LeadId",
                table: "LeadClassifications",
                column: "LeadId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LeadClassifications");

            migrationBuilder.DropTable(
                name: "Classifications");
        }
    }
}
