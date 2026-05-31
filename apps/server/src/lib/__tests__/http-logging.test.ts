describe('http-logging', () => {
  const realWarn = console.warn;

  afterEach(() => {
    console.warn = realWarn;
    jest.restoreAllMocks();
  });

  function loadModuleWithMocks(options?: { mirrorToConsole?: boolean }) {
    jest.resetModules();

    const emitServerLog = jest.fn();
    const getDebugLogConfig = jest
      .fn()
      .mockReturnValue({ mirrorToConsole: options?.mirrorToConsole ?? false });

    const baseLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    jest.doMock('../logging', () => ({
      emitServerLog,
      getDebugLogConfig,
      getBaseLogger: () => baseLogger,
    }));

    // requestLogger imports this too, so provide a stable noop.
    jest.doMock('../auth/session', () => ({
      readSessionFromRequest: () => null,
    }));

    const mod = require('../http-logging') as typeof import('../http-logging');

    return { mod, emitServerLog, getDebugLogConfig, baseLogger };
  }

  it('captures console.warn into emitServerLog and stringifies arguments', () => {
    const originalWarn = jest.fn();
    console.warn = originalWarn;

    const { mod, emitServerLog } = loadModuleWithMocks({ mirrorToConsole: false });

    mod.installConsoleWarningCapture();

    console.warn('hello', { a: 1 }, 123);

    expect(emitServerLog).toHaveBeenCalledTimes(1);
    expect(emitServerLog).toHaveBeenCalledWith(
      'server.warn',
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('hello'),
        details: { source: 'console.warn' },
      })
    );

    const payload = emitServerLog.mock.calls[0][1];
    expect(payload.message).toEqual(expect.stringContaining('a: 1'));
    expect(payload.message).toEqual(expect.stringContaining('123'));

    // mirrorToConsole=false => should NOT call original warn
    expect(originalWarn).not.toHaveBeenCalled();
  });

  it('mirrors to the original console.warn only when mirrorToConsole is enabled', () => {
    const originalWarn = jest.fn();
    console.warn = originalWarn;

    const { mod, emitServerLog } = loadModuleWithMocks({ mirrorToConsole: true });

    mod.installConsoleWarningCapture();

    console.warn('warning');

    expect(emitServerLog).toHaveBeenCalledTimes(1);
    expect(originalWarn).toHaveBeenCalledTimes(1);
    expect(originalWarn).toHaveBeenCalledWith('warning');
  });

  it('is safe to call installConsoleWarningCapture multiple times', () => {
    const originalWarn = jest.fn();
    console.warn = originalWarn;

    const { mod, emitServerLog } = loadModuleWithMocks({ mirrorToConsole: false });

    mod.installConsoleWarningCapture();
    mod.installConsoleWarningCapture();

    console.warn('once');

    expect(emitServerLog).toHaveBeenCalledTimes(1);
  });
});
