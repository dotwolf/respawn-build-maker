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

	users := router.Group("/users")
	{
		users.POST("", handlers.CreateUser(userService))
		users.GET("", handlers.GetUserByQuery(userService))
		users.DELETE("/:id", handlers.DeleteUser(userService)) // Protect later with authentication
	}

}
