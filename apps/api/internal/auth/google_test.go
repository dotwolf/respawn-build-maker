package auth

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleVerifierRequiresClientID(t *testing.T) {
	v := NewGoogleVerifier("")
	_, err := v.Verify(context.Background(), "not-a-token")
	require.Error(t, err)
	assert.ErrorIs(t, err, errGoogleNotConfigured)
}

func TestGoogleVerifierRejectsMalformedToken(t *testing.T) {
	v := NewGoogleVerifier("client-id")
	_, err := v.Verify(context.Background(), "not-a-jwt")
	require.Error(t, err)
}

func TestParseRSAKey(t *testing.T) {
	// n and e both encode the value 65537 in base64url.
	encoded := base64.RawURLEncoding.EncodeToString([]byte{1, 0, 1})
	key, err := parseRSAKey(encoded, encoded)
	require.NoError(t, err)
	assert.Equal(t, int64(65537), key.N.Int64())
	assert.Equal(t, 65537, key.E)
}
