package media

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// Only public HTTPS destinations, including every redirect and resolved address.
func PublicClient() *http.Client {
	transport := &http.Transport{TLSHandshakeTimeout: 10 * time.Second, ResponseHeaderTimeout: 30 * time.Second}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("结果域名不可解析")
		}
		for _, ip := range ips {
			if !ip.IP.IsGlobalUnicast() || ip.IP.IsPrivate() || ip.IP.IsLoopback() || ip.IP.IsLinkLocalUnicast() || strings.HasPrefix(ip.IP.String(), "100.100.") {
				return nil, fmt.Errorf("拒绝非公网结果地址")
			}
		}
		d := net.Dialer{Timeout: 15 * time.Second}
		return d.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
	}
	return &http.Client{Transport: transport, Timeout: 110 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if r.URL.Scheme != "https" || r.URL.User != nil || len(via) > 4 {
			return fmt.Errorf("结果重定向无效")
		}
		return nil
	}}
}
