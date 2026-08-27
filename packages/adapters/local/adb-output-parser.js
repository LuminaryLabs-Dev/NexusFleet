export function parseAdbDevices(output) {
  return output.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean).map(line => {
    const [serial, connectionState, ...details] = line.split(/\s+/);
    const fields = Object.fromEntries(details.filter(value => value.includes(':')).map(value => value.split(/:(.*)/s).slice(0, 2)));
    return {
      serial,
      connectionState,
      connection: serial.includes(':') ? 'wifi' : 'usb',
      model: (fields.model || 'Meta Quest').replaceAll('_', ' '),
      product: fields.product || null,
      transportId: fields.transport_id || null
    };
  });
}
