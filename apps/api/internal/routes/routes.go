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

	// Per-user throttles on mutating endpoints, falling back to per-IP for
	// unauthenticated callers. These blunt mass template/build generation and
	// vote manipulation. Generous per-user budgets so real usage is unaffected.
	templateCreateLimit := middleware.UserRateLimit(middleware.NewRateLimiter(10, time.Hour))
	templateEditLimit := middleware.UserRateLimit(middleware.NewRateLimiter(30, time.Hour))
	templateDeleteLimit := middleware.UserRateLimit(middleware.NewRateLimiter(30, time.Hour))
	buildCreateLimit := middleware.UserRateLimit(middleware.NewRateLimiter(30, time.Hour))
	buildEditLimit := middleware.UserRateLimit(middleware.NewRateLimiter(60, time.Hour))
	buildDeleteLimit := middleware.UserRateLimit(middleware.NewRateLimiter(60, time.Hour))
	voteLimit := middleware.UserRateLimit(middleware.NewRateLimiter(60, time.Minute))
	suggestionCreateLimit := middleware.UserRateLimit(middleware.NewRateLimiter(30, time.Hour))
	suggestionModerateLimit := middleware.UserRateLimit(middleware.NewRateLimiter(60, time.Hour))
	usernameLimit := middleware.UserRateLimit(middleware.NewRateLimiter(10, time.Hour))

	users := router.Group("/users")
	{
		users.POST("", registerRateLimit, handlers.CreateUser(userService))
		users.GET("", handlers.GetUserByQuery(userService))
		users.GET("/me", requireAuth, handlers.GetCurrentUser(userService))
		users.PUT("/me/username", requireAuth, usernameLimit, handlers.UpdateUsername(userService))
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
	builds.POST("/:build_id/vote", requireAuth, voteLimit, handlers.VoteBuild(buildService))
	builds.DELETE("/:build_id/vote", requireAuth, voteLimit, handlers.RemoveBuildVote(buildService))
	builds.DELETE("/:build_id", requireAuth, buildDeleteLimit, handlers.DeleteBuild(buildService))
	}

	router.GET("/public/builds", optionalAuth, handlers.ListPublicBuilds(buildService))
	router.GET("/stats", handlers.GetPublicStats(statsService))

	templates := router.Group("/templates")
	{
		templates.POST("", requireAuth, templateCreateLimit, handlers.CreateTemplate(templateService))
		templates.POST("/full", requireAuth, templateCreateLimit, handlers.CreateTemplate(templateService))
		templates.GET("", optionalAuth, handlers.ListTemplates(templateService))
		templates.GET("/count", optionalAuth, handlers.CountTemplatesByUser(templateService))
		templates.GET("/:template_id", optionalAuth, handlers.GetTemplateByID(templateService))
		templates.PUT("/:template_id", requireAuth, templateEditLimit, handlers.UpdateTemplate(templateService))
		templates.DELETE("/:template_id", requireAuth, templateDeleteLimit, handlers.DeleteTemplate(templateService))

		suggestions := templates.Group("/:template_id/suggestions")
		{
			suggestions.POST("", requireAuth, suggestionCreateLimit, handlers.CreateSuggestion(suggestionService))
			suggestions.GET("", requireAuth, handlers.ListSuggestionsByTemplate(suggestionService))
			suggestions.POST("/:suggestion_id/accept", requireAuth, suggestionModerateLimit, handlers.AcceptSuggestion(suggestionService))
			suggestions.DELETE("/:suggestion_id", requireAuth, suggestionModerateLimit, handlers.DeleteSuggestion(suggestionService))
		}

		builds := templates.Group("/:template_id/builds")
		{
			builds.POST("", requireAuth, buildCreateLimit, handlers.CreateBuild(buildService))
			builds.GET("", optionalAuth, handlers.ListBuildsByTemplate(buildService))
			builds.GET("/:build_id", optionalAuth, handlers.GetBuildByID(buildService))
			builds.PUT("/:build_id", requireAuth, buildEditLimit, handlers.UpdateBuildByID(buildService))
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
