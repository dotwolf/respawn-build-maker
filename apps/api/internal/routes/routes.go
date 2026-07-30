package routes

import (
	"main/apps/api/internal/handlers"
	"main/apps/api/internal/services"

	_ "main/apps/api/docs"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func SetupRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	userService := services.NewUserService(pool)
	buildService := services.NewBuildService(pool)
	templateService := services.NewTemplateService(pool)

	users := router.Group("/users")
	{
		users.POST("", handlers.CreateUser(userService))
		users.GET("", handlers.GetUserByQuery(userService))
		users.DELETE("/:id", handlers.DeleteUser(userService)) // Protect later with authentication
	}

	templates := router.Group("/templates")
	{
		templates.POST("", handlers.CreateTemplate(templateService))
		templates.GET("", handlers.ListTemplatesByUser(templateService))
		templates.GET("/:template_id", handlers.GetTemplateByID(templateService))

		builds := templates.Group("/:template_id/builds")
		{
			builds.POST("", handlers.CreateBuild(buildService))
			builds.GET("", handlers.ListBuildsByTemplate(buildService))
			builds.GET("/:build_id", handlers.GetBuildByID(buildService))
		}
	}
}
