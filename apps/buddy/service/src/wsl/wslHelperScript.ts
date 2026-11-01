// The resident helper that runs searches inside a WSL distribution. It is passed to `python3 -c` as an argument, so
// nothing is installed in the distribution and no port is opened: it talks over stdin and stdout only.
//
// Protocol (one JSON object per line, UTF-8):
//   helper -> host   {"t":"ready","v":1}                          once, when it can take requests
//                    {"id":n,"t":"o"|"e","d":"<base64>"}          a chunk of stdout or stderr of request n
//                    {"id":n,"t":"exit","code":0}                 request n ended (a negative code is a signal)
//                    {"id":n,"t":"exit","code":null,"err":"..."}  request n could not start: ENOENT, FORBIDDEN or SPAWN
//   host -> helper   {"id":n,"program":"rg","args":[...]}         start a program
//                    {"op":"cancel","id":n}                       kill request n and its children
//
// Only the programs in ALLOWED can be started, so the helper cannot be used as a general command runner. It exits when
// stdin closes (the host went away) and after `idle` seconds without a request, so it never outlives its use.
export const WSL_HELPER_VERSION = 1

// Python 3.7 or later; anything older fails at start and the host falls back to one wsl.exe per search.
export const WSL_HELPER_SCRIPT = String.raw`import asyncio, base64, json, os, signal, sys

VERSION = ${WSL_HELPER_VERSION}
ALLOWED = ('rg', 'find')
IDLE = float(sys.argv[1]) if len(sys.argv) > 1 else 300.0


async def main():
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader(limit=1 << 24)
    await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    out = sys.stdout.buffer
    procs = {}
    tasks = set()
    last = [loop.time()]

    def emit(message):
        out.write((json.dumps(message, separators=(',', ':')) + '\n').encode('ascii'))
        out.flush()

    def kill(process):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass

    async def pump(id, stream, kind):
        while True:
            chunk = await stream.read(65536)
            if not chunk:
                return
            emit({'id': id, 't': kind, 'd': base64.b64encode(chunk).decode('ascii')})

    async def run(request):
        id = request['id']
        program = request.get('program')
        if program not in ALLOWED:
            emit({'id': id, 't': 'exit', 'code': None, 'err': 'FORBIDDEN'})
            return
        try:
            process = await asyncio.create_subprocess_exec(
                program, *[str(arg) for arg in request.get('args', [])],
                stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                start_new_session=True)
        except OSError as error:
            emit({'id': id, 't': 'exit', 'code': None, 'err': 'ENOENT' if isinstance(error, FileNotFoundError) else 'SPAWN'})
            return
        procs[id] = process
        try:
            await asyncio.gather(pump(id, process.stdout, 'o'), pump(id, process.stderr, 'e'))
            code = await process.wait()
        finally:
            procs.pop(id, None)
            last[0] = loop.time()
        emit({'id': id, 't': 'exit', 'code': code})

    async def watch_idle():
        tick = max(0.2, min(5.0, IDLE / 4))
        while True:
            await asyncio.sleep(tick)
            if not procs and loop.time() - last[0] > IDLE:
                os._exit(0)

    emit({'t': 'ready', 'v': VERSION})
    tasks.add(asyncio.ensure_future(watch_idle()))
    while True:
        line = await reader.readline()
        if not line:
            break
        last[0] = loop.time()
        try:
            request = json.loads(line)
        except ValueError:
            continue
        if request.get('op') == 'cancel':
            process = procs.get(request.get('id'))
            if process:
                kill(process)
            continue
        task = asyncio.ensure_future(run(request))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    for process in list(procs.values()):
        kill(process)


asyncio.run(main())
`
