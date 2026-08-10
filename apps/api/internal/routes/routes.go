package routes

import (
	"main/apps/api/internal/auth"
	"main/apps/api/internal/handlers"
	"main/apps/api/internal/middleware"
	"main/apps/api/internal/services"
	"os"
	"time"

	_ "main/apps/api/docs"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func SetupRoutes(router *gin.Engine, pool *pgxpool.Pool) {
	// Swagger UI is a developer tool and should not be exposed in release.
	if os.Getenv("GIN_MODE") != gin.ReleaseMode {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	userService := services.NewUserService(pool)
	authService := services.NewAuthService(pool, os.Getenv("GOOGLE_CLIENT_ID"))
	buildService := services.NewBuildService(pool)
	templateService := services.NewTemplateService(pool)
	statsService := services.NewStatsService(pool)
	suggestionService := services.NewSuggestionService(pool)

	requireAuth := auth.RequireAuth(authService.VerifyToken)
	optionalAuth := auth.OptionalAuth(authService.VerifyToken)

	// Brute-force and abuse protection on credential endpoints.
	authRateLimit := middleware.RateLimit(middleware.NewRateLimiter(10, time.Minute))
	registerRateLimit := middleware.RateLimit(middleware.NewRateLimiter(5, time.Minute))

	users := router.Group("/users")
	{
		users.POST("", registerRateLimit, handlers.CreateUser(userService))
		users.GET("", handlers.GetUserByQuery(userService))
		users.GET("/me", requireAuth, handlers.GetCurrentUser(userService))
		users.PUT("/me/username", requireAuth, handlers.UpdateUsername(userService))
		users.DELETE("/:id", requireAuth, handlers.DeleteUser(userService))
	}

	authGroup := router.Group("/auth")
	{
		authGroup.POST("/login", authRateLimit, handlers.Login(authService))
		authGroup.POST("/google", authRateLimit, handlers.GoogleLogin(authService))
	}

	builds := router.Group("/builds")
	{
	builds.GET("", requireAuth, handlers.ListBuildsByUser(buildService))
	builds.GET("/count", requireAuth, handlers.CountBuildsByUser(buildService))
	builds.GET("/liked", requireAuth, handlers.ListLikedBuilds(buildService))
	builds.GET("/liked/count", requireAuth, handlers.CountLikedBuildsByUser(buildService))
	builds.POST("/:build_id/vote", requireAuth, handlers.VoteBuild(buildService))
	builds.DELETE("/:build_id/vote", requireAuth, handlers.RemoveBuildVote(buildService))
	builds.DELETE("/:build_id", requireAuth, handlers.DeleteBuild(buildService))
	}

	router.GET("/public/builds", optionalAuth, handlers.ListPublicBuilds(buildService))
	router.GET("/stats", handlers.GetPublicStats(statsService))

	templates := router.Group("/templates")
	{
		templates.POST("", requireAuth, handlers.CreateTemplate(templateService))
		templates.POST("/full", requireAuth, handlers.CreateTemplate(templateService))
		templates.GET("", optionalAuth, handlers.ListTemplates(templateService))
		templates.GET("/count", optionalAuth, handlers.CountTemplatesByUser(templateService))
		templates.GET("/:template_id", optionalAuth, handlers.GetTemplateByID(templateService))
		templates.PUT("/:template_id", requireAuth, handlers.UpdateTemplate(templateService))
		templates.DELETE("/:template_id", requireAuth, handlers.DeleteTemplate(templateService))

		suggestions := templates.Group("/:template_id/suggestions")
		{
			suggestions.POST("", requireAuth, handlers.CreateSuggestion(suggestionService))
			suggestions.GET("", requireAuth, handlers.ListSuggestionsByTemplate(suggestionService))
			suggestions.POST("/:suggestion_id/accept", requireAuth, handlers.AcceptSuggestion(suggestionService))
			suggestions.DELETE("/:suggestion_id", requireAuth, handlers.DeleteSuggestion(suggestionService))
		}

		builds := templates.Group("/:template_id/builds")
		{
			builds.POST("", requireAuth, handlers.CreateBuild(buildService))
			builds.GET("", optionalAuth, handlers.ListBuildsByTemplate(buildService))
			builds.GET("/:build_id", optionalAuth, handlers.GetBuildByID(buildService))
			builds.PUT("/:build_id", requireAuth, handlers.UpdateBuildByID(buildService))
		}
	}

	me := router.Group("/me", requireAuth)
	{
		me.GET("/suggestions/count", handlers.CountPendingSuggestions(suggestionService))
		me.GET("/suggestions/pending", handlers.ListPendingSuggestionNotifications(suggestionService))
		me.GET("/suggestion-notifications", handlers.GetSuggestionNotifications(suggestionService))
		me.GET("/suggestion-notifications/count", handlers.CountUnreadSuggestionNotifications(suggestionService))
	}
}
