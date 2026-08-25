function emsg(e) { return String((e && e.message) || e) }

function mkFail(message, code, status) {
  const err = new Error(message)
  err.code = code
  err.failure = status === undefined ? { message: message, code: code } : { message: message, code: code, status: status }
  if (status !== undefined) err.status = status
  return err
}

