package proxy

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

type PrometheusProxy struct {
	proxy  *httputil.ReverseProxy
	target *url.URL
}

func NewPrometheusProxy(rawTarget string) (*PrometheusProxy, error) {
	if !strings.HasPrefix(rawTarget, "http://") && !strings.HasPrefix(rawTarget, "https://") {
		rawTarget = "http://" + rawTarget
	}
	target, err := url.Parse(rawTarget)
	if err != nil {
		return nil, err
	}

	revProxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := revProxy.Director

	revProxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host

		if target.User != nil {
			pass, _ := target.User.Password()
			req.SetBasicAuth(target.User.Username(), pass)
		}
	}

	revProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[proxy-error] Prometheus upstream error: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"status":"error","errorType":"bad_gateway","error":"cannot reach Prometheus upstream: ` + err.Error() + `"}`))
	}

	return &PrometheusProxy{
		proxy:  revProxy,
		target: target,
	}, nil
}

func (p *PrometheusProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	p.proxy.ServeHTTP(w, r)
}
