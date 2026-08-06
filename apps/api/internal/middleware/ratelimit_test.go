package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRateLimiterAllowsThenBlocks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rl := NewRateLimiter(2, time.Minute)
	defer rl.Stop()

	router := gin.New()
	router.Use(RateLimit(rl))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	newRequest := func() *http.Request {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "192.0.2.1:1234"
		return req
	}

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, newRequest())
		assert.Equal(t, http.StatusOK, rec.Code)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, newRequest())
	assert.Equal(t, http.StatusTooManyRequests, rec.Code)
	assert.NotEmpty(t, rec.Header().Get("Retry-After"))
}

func TestRateLimiterSeparateClients(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rl := NewRateLimiter(1, time.Minute)
	defer rl.Stop()

	router := gin.New()
	router.Use(RateLimit(rl))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, addr := range []string{"192.0.2.1:1234", "192.0.2.2:1234"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = addr
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
	}
}
