package pezhwan

import "context"

// SessionService implements the /v1/sessions* endpoints.
type SessionService struct {
	client *Client
}

// List returns the authenticated user's active sessions.
func (s *SessionService) List(ctx context.Context) ([]Session, error) {
	data, err := s.client.get(ctx, "/v1/sessions")
	if err != nil {
		return nil, err
	}
	items := data["sessions"]
	raw, ok := items.([]any)
	if !ok {
		return nil, nil
	}
	out := make([]Session, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, Session{
				ID:           str(m["_id"]),
				Device:       orStr(m["device"], m["userAgent"]),
				UserAgent:    str(m["userAgent"]),
				IP:           str(m["ip"]),
				LastActiveAt: orStr(m["lastActiveAt"], m["updatedAt"]),
			})
		}
	}
	return out, nil
}

// Revoke terminates one session.
func (s *SessionService) Revoke(ctx context.Context, sessionID string) error {
	return s.client.delete(ctx, "/v1/sessions/"+sessionID+"/revoke")
}

// RevokeAll terminates every session for the authenticated user.
func (s *SessionService) RevokeAll(ctx context.Context) error {
	_, err := s.client.post(ctx, "/v1/sessions/all/revoke", map[string]any{})
	return err
}

func orStr(values ...any) string {
	for _, v := range values {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	return ""
}