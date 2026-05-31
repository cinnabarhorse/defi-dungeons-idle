describe('logging/metrics', () => {
  function loadFresh() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../metrics') as typeof import('../metrics');
  }

  it('tracks drops per-level and total drops', () => {
    const metrics = loadFresh();

    metrics.recordDrop('info');
    metrics.recordDrop('info');
    metrics.recordDrop('error');

    const snapshot = metrics.captureMetrics();
    expect(snapshot.droppedTotal).toBe(3);
    expect(snapshot.droppedByLevel.info).toBe(2);
    expect(snapshot.droppedByLevel.error).toBe(1);
    // Sanity check: untouched levels remain 0
    expect(snapshot.droppedByLevel.debug).toBe(0);
    expect(snapshot.droppedByLevel.warn).toBe(0);
    expect(snapshot.droppedByLevel.fatal).toBe(0);
  });

  it('never lets pendingUploads go below 0 when settling uploads', () => {
    const metrics = loadFresh();

    metrics.markUploadSettled(true);
    metrics.markUploadSettled(false);

    const snapshot = metrics.captureMetrics();
    expect(snapshot.pendingUploads).toBe(0);
    expect(snapshot.completedUploads).toBe(1);
    expect(snapshot.failedUploads).toBe(1);
  });

  it('captureMetrics returns a deep copy (mutations do not affect internal state)', () => {
    const metrics = loadFresh();

    metrics.setQueueMax(123);
    metrics.updateQueueDepth(7);
    metrics.recordEnqueue();
    metrics.recordProcessed();

    const snapshot1 = metrics.captureMetrics();
    snapshot1.queueMax = 999;
    snapshot1.droppedByLevel.info = 42;

    const snapshot2 = metrics.captureMetrics();
    expect(snapshot2.queueMax).toBe(123);
    expect(snapshot2.queueDepth).toBe(7);
    expect(snapshot2.enqueuedLines).toBe(1);
    expect(snapshot2.processedLines).toBe(1);
    expect(snapshot2.droppedByLevel.info).toBe(0);
  });
});
