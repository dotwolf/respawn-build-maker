package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	googleCertsURL = "https://www.googleapis.com/oauth2/v3/certs"
	googleIssuer   = "https://accounts.google.com"
	googleCertTTL  = 15 * time.Minute
)

var errGoogleNotConfigured = errors.New("google login is not configured")

// GoogleClaims holds the fields we rely on from a Google ID token.
type GoogleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	jwt.RegisteredClaims
}

type googleCerts struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Alg string `json:"alg"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

// GoogleVerifier validates Google ID tokens against Google's public signing
// keys, which are fetched from the JWKS endpoint and cached briefly.
type GoogleVerifier struct {
	clientID string
	client   *http.Client

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

func NewGoogleVerifier(clientID string) *GoogleVerifier {
	return &GoogleVerifier{
		clientID: clientID,
		client:   &http.Client{Timeout: 10 * time.Second},
		keys:     map[string]*rsa.PublicKey{},
	}
}

// Verify validates an ID token's signature, issuer, audience and expiry, and
// returns the verified claims.
func (v *GoogleVerifier) Verify(ctx context.Context, idToken string) (*GoogleClaims, error) {
	if v == nil || v.clientID == "" {
		return nil, errGoogleNotConfigured
	}

	claims := &GoogleClaims{}
	token, _, err := jwt.NewParser().ParseUnverified(idToken, claims)
	if err != nil {
		return nil, err
	}

	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		return nil, errors.New("google token is missing a key id")
	}

	key, err := v.publicKey(ctx, kid)
	if err != nil {
		return nil, err
	}

	parsed, err := jwt.ParseWithClaims(
		idToken,
		claims,
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return key, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithIssuer(googleIssuer),
		jwt.WithAudience(v.clientID),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil {
		return nil, err
	}
	if !parsed.Valid {
		return nil, errors.New("invalid google token")
	}
	if claims.Subject == "" || claims.Email == "" {
		return nil, errors.New("google token is missing subject or email")
	}
	if !claims.EmailVerified {
		return nil, errors.New("google email is not verified")
	}

	return claims, nil
}

func (v *GoogleVerifier) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if time.Since(v.fetchedAt) < googleCertTTL {
		key, ok := v.keys[kid]
		if !ok {
			return nil, errors.New("google public key not found")
		}
		return key, nil
	}

	certs, err := v.fetchCerts(ctx)
	if err != nil {
		return nil, err
	}

	keys := make(map[string]*rsa.PublicKey, len(certs.Keys))
	for _, k := range certs.Keys {
		if k.Kty != "RSA" || k.Kid == "" {
			continue
		}
		key, err := parseRSAKey(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = key
	}
	if len(keys) == 0 {
		return nil, errors.New("no valid google public keys found")
	}

	v.keys = keys
	v.fetchedAt = time.Now()

	key, ok := keys[kid]
	if !ok {
		return nil, errors.New("google public key not found")
	}
	return key, nil
}

func (v *GoogleVerifier) fetchCerts(ctx context.Context) (*googleCerts, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCertsURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google certs endpoint returned %s", resp.Status)
	}

	var certs googleCerts
	if err := json.NewDecoder(resp.Body).Decode(&certs); err != nil {
		return nil, err
	}
	return &certs, nil
}

func parseRSAKey(n, e string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(n)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, err
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: int(new(big.Int).SetBytes(eBytes).Int64()),
	}, nil
}
