package routes

import (
	"main/apps/api/internal/auth"
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
	authService := services.NewAuthService(pool)
	buildService := services.NewBuildService(pool)
	templateService := services.NewTemplateService(pool)

	authMiddleware := auth.RequireAuth(authService.VerifyToken)

	users := router.Group("/users")
	{
		users.POST("", handlers.CreateUser(userService))
		users.GET("", handlers.GetUserByQuery(userService))
		users.GET("/me", authMiddleware, handlers.GetCurrentUser(userService))
		users.DELETE("/:id", authMiddleware, handlers.DeleteUser(userService))
	}

	authGroup := router.Group("/auth")
	{
		authGroup.POST("/login", handlers.Login(authService))
	}

	builds := router.Group("/builds")
	{
		builds.GET("", handlers.ListBuildsByUser(buildService))
	}

	templates := router.Group("/templates")
	{
		templates.POST("", handlers.CreateTemplate(templateService))
		templates.POST("/full", authMiddleware, handlers.CreateTemplate(templateService))
		templates.GET("", handlers.ListTemplates(templateService))
		templates.GET("/:template_id", handlers.GetTemplateByID(templateService))
		templates.PUT("/:template_id", authMiddleware, handlers.UpdateTemplate(templateService))
		templates.DELETE("/:template_id", authMiddleware, handlers.DeleteTemplate(templateService))

		builds := templates.Group("/:template_id/builds")
		{
			builds.POST("", handlers.CreateBuild(buildService))
			builds.GET("", handlers.ListBuildsByTemplate(buildService))
			builds.GET("/:build_id", handlers.GetBuildByID(buildService))
		}
	}
}
