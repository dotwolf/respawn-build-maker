package routes

import (
	"main/apps/api/internal/handlers"

	_ "main/apps/api/docs"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func SetupRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	users := router.Group("/users")
	{
		users.POST("", handlers.CreateUser(pool))
		users.GET("", handlers.GetUserByQuery(pool))
		users.DELETE("/:id", handlers.DeleteUser(pool)) // Protect later with authentication
	}

}
