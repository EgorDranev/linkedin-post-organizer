export function request({ method = "GET", headers = {}, body, query = {} } = {}) {
  return { method, headers, body, query, url: "http://localhost/api/test" };
}

export function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}
