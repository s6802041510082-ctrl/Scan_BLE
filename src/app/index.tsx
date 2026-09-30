import { Buffer } from 'buffer';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

const C = {
  bg: '#EEE4D5',
  paper: '#F8F0E5',
  white: '#FFFDF8',
  coral: '#EF5B57',
  coralDark: '#D84D49',
  charcoal: '#41413F',
  dark: '#292927',
  text: '#242422',
  soft: '#68645E',
  light: '#999087',
  line: '#B8ADA0',
  green: '#4D7A65',
};

export default function Index() {
  const manager = useRef(new BleManager()).current;
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [device, setDevice] = useState<Device | null>(null);
  const [preview, setPreview] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [firstRead, setFirstRead] = useState(false);
  const [written, setWritten] = useState(false);
  const [finalRead, setFinalRead] = useState(false);
  const [value, setValue] = useState('');
  const [myName, setMyName] = useState('');
  const [buddyName, setBuddyName] = useState('');

  useEffect(() => {
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      manager.stopDeviceScan();
      manager.destroy();
    };
  }, [manager]);

  async function requestPermissions() {
    if (Platform.OS !== 'android') return true;
    try {
      if (Number(Platform.Version) >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
      return (
        (await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        )) === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (e) {
      console.log('Permission error:', e);
      return false;
    }
  }

  function resetActivity() {
    setValue('');
    setMyName('');
    setBuddyName('');
    setFirstRead(false);
    setWritten(false);
    setFinalRead(false);
  }

  async function startScan() {
    if (!(await requestPermissions())) {
      Alert.alert('Permission required', 'Please allow Bluetooth permissions.');
      return;
    }

    manager.stopDeviceScan();
    if (scanTimer.current) clearTimeout(scanTimer.current);
    setDevices([]);
    setScanning(true);

    manager.startDeviceScan(null, null, (error, found) => {
      if (error) {
        console.log('Scan error:', error);
        manager.stopDeviceScan();
        setScanning(false);
        Alert.alert('Scan failed', error.message);
        return;
      }
      if (!found || !(found.name || found.localName)) return;

      setDevices(current =>
        current.some(item => item.id === found.id)
          ? current
          : [...current, found]
      );
    });

    scanTimer.current = setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
    }, 10000);
  }

  async function connect(found: Device) {
    try {
      manager.stopDeviceScan();
      setScanning(false);
      setConnecting(true);
      const connected = await manager.connectToDevice(found.id);
      const ready = await connected.discoverAllServicesAndCharacteristics();
      resetActivity();
      setDevice(ready);
    } catch (e: any) {
      console.log('Connect error:', e);
      Alert.alert('Connection failed', e?.message || 'Unable to connect.');
    } finally {
      setConnecting(false);
    }
  }

  async function read(isFinal = false) {
    if (preview) {
      setReading(true);
      setTimeout(() => {
        setValue(isFinal ? 'GRADE : A' : 'Hello from BLE device');
        isFinal ? setFinalRead(true) : setFirstRead(true);
        setReading(false);
      }, 450);
      return;
    }

    if (!device) return;
    try {
      setReading(true);
      const characteristic = await manager.readCharacteristicForDevice(
        device.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const decoded = Buffer.from(
        characteristic.value || '',
        'base64'
      ).toString('utf8');
      setValue(decoded || '(Empty value)');
      isFinal ? setFinalRead(true) : setFirstRead(true);
    } catch (e: any) {
      console.log('Read error:', e);
      Alert.alert('Read failed', e?.message || 'Unable to read value.');
    } finally {
      setReading(false);
    }
  }

  async function write() {
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('Names required', 'Please enter both names.');
      return;
    }

    const message = `${myName.trim()}, ${buddyName.trim()}`;

    if (preview) {
      setWriting(true);
      setTimeout(() => {
        setWritten(true);
        setFinalRead(false);
        setValue('');
        setWriting(false);
        Alert.alert('Names sent', `${message}\n\nNow press Read again.`);
      }, 450);
      return;
    }

    if (!device) return;
    try {
      setWriting(true);
      const encoded = Buffer.from(message, 'utf8').toString('base64');
      await manager.writeCharacteristicWithResponseForDevice(
        device.id,
        SERVICE_UUID,
        CHAR_UUID,
        encoded
      );
      setWritten(true);
      setFinalRead(false);
      setValue('');
      Alert.alert('Names sent', 'Read again to receive the result.');
    } catch (e: any) {
      console.log('Write error:', e);
      Alert.alert('Write failed', e?.message || 'Unable to write value.');
    } finally {
      setWriting(false);
    }
  }

  async function leaveActivity() {
    if (preview) {
      setPreview(false);
      resetActivity();
      return;
    }
    if (device) {
      try {
        await manager.cancelDeviceConnection(device.id);
      } catch (e) {
        console.log('Disconnect error:', e);
      }
    }
    setDevice(null);
    resetActivity();
  }

  function openPreview() {
    manager.stopDeviceScan();
    setScanning(false);
    resetActivity();
    setPreview(true);
  }

  if (!device && !preview) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={s.screen}>
          <Decor />
          <FlatList
            data={devices}
            keyExtractor={item => item.id}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <>
                <View style={s.nav}>
                  <View>
                    <Text style={s.brand}>BLE Connect</Text>
                    <Text style={s.brandSub}>READ / WRITE / CONNECT</Text>
                  </View>
                  <View style={s.menu}>
                    <View style={s.menuLine} />
                    <View style={s.menuLine} />
                    <View style={[s.menuLine, { width: 11 }]} />
                  </View>
                </View>

                <View style={s.hero}>
                  <View style={s.heroCircle} />
                  <View style={s.heroRing} />
                  <Text style={s.heroNo}>01</Text>
                  <Text style={s.eyebrow}>BLUETOOTH LOW ENERGY</Text>
                  <Text style={s.heroTitle}>
                    Ready to{'\n'}
                    <Text style={s.coral}>connect?</Text>
                  </Text>
                  <Text style={s.heroText}>
                    Find your instructor’s Bluetooth device and begin the activity.
                  </Text>
                  <Text style={s.heroArrow}>→</Text>
                </View>

                <View style={s.intro}>
                  <Text style={s.smallNo}>01</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.introTitle}>Connect to your{'\n'}BLE device.</Text>
                    <Text style={s.body}>
                      Search for a nearby Bluetooth Low Energy device provided by
                      your instructor.
                    </Text>
                  </View>
                </View>

                <View style={s.status}>
                  <View style={s.statusLeft}>
                    <View style={[s.dot, scanning && { backgroundColor: C.coral }]} />
                    <View>
                      <Text style={s.statusTitle}>
                        {scanning ? 'Searching' : 'Bluetooth ready'}
                      </Text>
                      <Text style={s.micro}>
                        {scanning ? 'Looking for nearby devices' : 'Ready when you are'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.statusCode}>{scanning ? 'SCANNING' : 'READY'}</Text>
                </View>

                <TouchableOpacity
                  style={[s.primary, scanning && { opacity: 0.65 }]}
                  disabled={scanning}
                  onPress={startScan}
                >
                  <Text style={s.primaryNo}>01</Text>
                  <Text style={s.primaryText}>
                    {scanning ? 'Searching devices' : 'Scan devices'}
                  </Text>
                  {scanning ? (
                    <ActivityIndicator color={C.paper} />
                  ) : (
                    <Text style={s.primaryArrow}>→</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={s.preview} onPress={openPreview}>
                  <Text style={s.previewText}>Preview activity</Text>
                  <Text style={s.coral}>↗</Text>
                </TouchableOpacity>

                <View style={s.heading}>
                  <View>
                    <Text style={s.eyebrowCoral}>DISCOVER</Text>
                    <Text style={s.headingTitle}>Nearby devices</Text>
                  </View>
                  <Text style={s.count}>
                    {String(devices.length).padStart(2, '0')}
                  </Text>
                </View>

                {!devices.length && (
                  <View style={s.empty}>
                    <View style={s.emptyCircle} />
                    <View style={s.emptyRing} />
                    <Text style={s.emptyTitle}>No devices yet.</Text>
                    <Text style={s.body}>
                      Start scanning to discover nearby Bluetooth Low Energy devices.
                    </Text>
                    <View style={s.accentLine} />
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.device}
                disabled={connecting}
                onPress={() => connect(item)}
              >
                <View style={s.deviceIcon}>
                  <Text style={s.deviceIconText}>B</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.deviceName} numberOfLines={1}>
                    {item.name || item.localName || 'BLE Device'}
                  </Text>
                  <Text style={s.deviceId} numberOfLines={1}>{item.id}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.micro}>{item.rssi ?? '--'} dBm</Text>
                  <Text style={s.deviceArrow}>→</Text>
                </View>
              </TouchableOpacity>
            )}
            ListFooterComponent={<Text style={s.footer}>BLE CONNECT / 2026</Text>}
          />

          {connecting && (
            <View style={s.overlay}>
              <View style={s.modal}>
                <ActivityIndicator size="large" color={C.coral} />
                <Text style={s.modalTitle}>Connecting</Text>
                <Text style={s.body}>Establishing connection with your BLE device.</Text>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={s.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Decor />
        <ScrollView
          contentContainerStyle={s.activityContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.activityNav}>
            <TouchableOpacity onPress={leaveActivity}>
              <Text style={s.back}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.brandSub}>BLE CONNECT</Text>
              <Text style={s.activityTitle}>Activity</Text>
            </View>
            <View style={s.live}>
              <View style={[s.dot, preview && { backgroundColor: C.coral }]} />
              <Text style={s.liveText}>{preview ? 'PREVIEW' : 'LIVE'}</Text>
            </View>
          </View>

          <View style={s.connected}>
            <Text style={s.eyebrowCoral}>CONNECTED DEVICE</Text>
            <Text style={s.connectedName} numberOfLines={1}>
              {preview ? 'Teacher BLE Device' : device?.name || 'BLE Device'}
            </Text>
            <Text style={s.deviceId} numberOfLines={1}>
              {preview ? 'Preview connection' : device?.id}
            </Text>
          </View>

          <StepHeader number="01" label="READ" />
          <Text style={s.stepTitle}>Read the current{'\n'}device value.</Text>
          <View style={s.darkCard}>
            <View style={s.darkCircle} />
            <Text style={s.darkLabel}>CHARACTERISTIC</Text>
            <Text style={s.darkTitle}>Read from{'\n'}your device.</Text>
            <Text style={s.darkBody}>
              Request the current value stored in the BLE Characteristic.
            </Text>

            {firstRead && !written && (
              <View style={s.readBox}>
                <Text style={s.darkLabel}>RECEIVED</Text>
                <Text style={s.readValue}>{value}</Text>
              </View>
            )}

            <TouchableOpacity
              style={s.darkAction}
              disabled={reading}
              onPress={() => read(false)}
            >
              <Text style={s.darkActionText}>
                {reading ? 'Reading...' : 'Read value'}
              </Text>
              {reading ? (
                <ActivityIndicator color={C.coral} />
              ) : (
                <Text style={s.coralArrow}>→</Text>
              )}
            </TouchableOpacity>
          </View>

          <StepHeader number="02" label="WRITE" />
          <Text style={s.stepTitle}>Send your{'\n'}names.</Text>
          <Text style={s.activityBody}>
            Enter your name and your buddy’s name. Both names will be written to
            the BLE Characteristic.
          </Text>

          <Field
            letter="A"
            label="YOUR NAME"
            value={myName}
            placeholder="Enter your name"
            onChange={setMyName}
          />
          <Field
            letter="B"
            label="BUDDY’S NAME"
            value={buddyName}
            placeholder="Enter buddy's name"
            onChange={setBuddyName}
          />

          <TouchableOpacity style={s.primary} disabled={writing} onPress={write}>
            <Text style={s.primaryText}>
              {writing ? 'Sending names' : 'Send names'}
            </Text>
            {writing ? (
              <ActivityIndicator color={C.paper} />
            ) : (
              <Text style={s.primaryArrow}>→</Text>
            )}
          </TouchableOpacity>

          <StepHeader number="03" label="RESULT" />
          <View style={s.result}>
            <View style={s.resultCircle} />
            <Text style={s.resultLabel}>YOUR RESULT</Text>
            <Text style={s.resultTitle}>Read{'\n'}again.</Text>

            {finalRead && value ? (
              <>
                <Text style={s.resultResponse}>DEVICE RESPONSE</Text>
                <Text style={s.resultValue}>{value}</Text>
              </>
            ) : (
              <>
                <Text style={s.waiting}>--</Text>
                <Text style={s.resultDescription}>
                  Send your names first, then read the Characteristic again to
                  receive your result.
                </Text>
              </>
            )}

            <TouchableOpacity
              disabled={!written || reading}
              onPress={() => read(true)}
              style={[s.resultButton, !written && { opacity: 0.35 }]}
            >
              <Text style={s.resultButtonText}>
                {reading ? 'Reading...' : 'Read again'}
              </Text>
              {reading ? (
                <ActivityIndicator color={C.coral} />
              ) : (
                <Text style={s.coralArrow}>→</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={s.config}>
            <Text style={s.configTitle}>BLE CONFIGURATION</Text>
            <Text style={s.configLabel}>SERVICE</Text>
            <Text style={s.configValue}>{SERVICE_UUID}</Text>
            <Text style={s.configLabel}>CHARACTERISTIC</Text>
            <Text style={s.configValue}>{CHAR_UUID}</Text>
          </View>

          <TouchableOpacity style={s.exit} onPress={leaveActivity}>
            <Text style={s.exitText}>{preview ? 'Exit preview' : 'Disconnect'}</Text>
            <Text style={s.deviceArrow}>→</Text>
          </TouchableOpacity>
          <Text style={s.footer}>BLE CONNECT / ACTIVITY</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepHeader({ number, label }: { number: string; label: string }) {
  return (
    <View style={s.stepHeader}>
      <Text style={s.stepNo}>{number}</Text>
      <View style={s.stepLine} />
      <Text style={s.stepLabel}>{label}</Text>
    </View>
  );
}

function Field({
  letter,
  label,
  value,
  placeholder,
  onChange,
}: {
  letter: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLetter}>{letter}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.inputLabel}>{label}</Text>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.light}
          autoCapitalize="words"
        />
      </View>
    </View>
  );
}

function Decor() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={s.bg} />
      <View style={s.bgCircle} />
      <View style={s.bgRing} />
      <View style={s.bgLine} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: C.bg },
  bgCircle: {
    position: 'absolute', width: 190, height: 190, borderRadius: 95,
    backgroundColor: C.coral, left: -125, top: -75, opacity: 0.85,
  },
  bgRing: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    borderWidth: 1, borderColor: C.coral, right: -90, top: 150,
  },
  bgLine: {
    position: 'absolute', width: 240, height: 1, right: -80, top: 360,
    backgroundColor: 'rgba(36,36,34,0.10)', transform: [{ rotate: '-28deg' }],
  },
  content: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 42 },
  activityContent: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 50 },
  nav: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  brand: { color: C.text, fontSize: 15, fontWeight: '800' },
  brandSub: {
    color: C.soft, fontSize: 7, fontWeight: '800',
    letterSpacing: 1.3, marginTop: 2,
  },
  menu: { width: 32, alignItems: 'flex-end' },
  menuLine: { width: 19, height: 1, backgroundColor: C.text, marginVertical: 2 },
  hero: {
    height: 335, backgroundColor: C.paper, padding: 25,
    overflow: 'hidden', justifyContent: 'center',
    shadowColor: '#6C6258', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  heroCircle: {
    position: 'absolute', width: 205, height: 205, borderRadius: 103,
    backgroundColor: C.coral, right: -80, top: -55,
  },
  heroRing: {
    position: 'absolute', width: 145, height: 145, borderRadius: 73,
    borderWidth: 1, borderColor: C.coral, right: -35, top: 92,
  },
  heroNo: {
    position: 'absolute', right: -6, bottom: -28, color: 'rgba(65,65,63,0.08)',
    fontSize: 120, fontWeight: '300',
  },
  eyebrow: {
    color: C.text, fontSize: 7, fontWeight: '900',
    letterSpacing: 1.5, marginBottom: 14,
  },
  eyebrowCoral: {
    color: C.coral, fontSize: 7, fontWeight: '900', letterSpacing: 1.6,
  },
  heroTitle: {
    color: C.text, fontSize: 39, lineHeight: 42,
    fontWeight: '400', letterSpacing: -1.4,
  },
  coral: { color: C.coral, fontWeight: '700' },
  heroText: {
    color: C.soft, fontSize: 10, lineHeight: 15,
    maxWidth: 185, marginTop: 16,
  },
  heroArrow: {
    position: 'absolute', right: 25, bottom: 20,
    color: C.coral, fontSize: 42, fontWeight: '200',
  },
  intro: {
    flexDirection: 'row', paddingVertical: 27,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  smallNo: { width: 50, color: C.coral, fontSize: 10, fontWeight: '900' },
  introTitle: {
    color: C.text, fontSize: 22, lineHeight: 25,
    fontWeight: '500', letterSpacing: -0.5,
  },
  body: { color: C.soft, fontSize: 9, lineHeight: 14, marginTop: 8 },
  status: {
    minHeight: 72, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.line,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.green, marginRight: 10,
  },
  statusTitle: { color: C.text, fontSize: 11, fontWeight: '800' },
  micro: { color: C.light, fontSize: 8, marginTop: 3 },
  statusCode: {
    color: C.green, fontSize: 7, fontWeight: '900', letterSpacing: 1.1,
  },
  primary: {
    minHeight: 62, backgroundColor: C.coral, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 17, marginTop: 20,
  },
  primaryNo: { color: 'rgba(255,255,255,.65)', fontSize: 9, marginRight: 16 },
  primaryText: { flex: 1, color: C.paper, fontSize: 13, fontWeight: '900' },
  primaryArrow: { color: C.paper, fontSize: 30, fontWeight: '200' },
  preview: {
    alignSelf: 'flex-end', flexDirection: 'row',
    alignItems: 'center', paddingVertical: 17, gap: 8,
  },
  previewText: { color: C.soft, fontSize: 9 },
  heading: {
    flexDirection: 'row', alignItems: 'flex-end',
    justifyContent: 'space-between', marginTop: 12, marginBottom: 16,
  },
  headingTitle: {
    color: C.text, fontSize: 25, fontWeight: '500',
    letterSpacing: -0.7, marginTop: 4,
  },
  count: { color: C.coral, fontSize: 32, fontWeight: '300' },
  empty: {
    minHeight: 220, backgroundColor: C.paper, padding: 24,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  emptyCircle: {
    position: 'absolute', width: 95, height: 95, borderRadius: 48,
    backgroundColor: C.coral, right: -20, top: -20,
  },
  emptyRing: {
    position: 'absolute', width: 95, height: 95, borderRadius: 48,
    borderWidth: 1, borderColor: C.charcoal, right: 28, top: 27,
  },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '600' },
  accentLine: { width: 45, height: 2, backgroundColor: C.coral, marginTop: 15 },
  device: {
    minHeight: 82, flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.line,
  },
  deviceIcon: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: C.charcoal,
    alignItems: 'center', justifyContent: 'center', marginRight: 13,
  },
  deviceIconText: { color: C.paper, fontSize: 12, fontWeight: '800' },
  deviceName: { color: C.text, fontSize: 12, fontWeight: '800' },
  deviceId: { color: C.light, fontSize: 7, marginTop: 4 },
  deviceArrow: { color: C.coral, fontSize: 25, fontWeight: '300' },
  footer: {
    color: C.light, fontSize: 7, letterSpacing: 1.2,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16, marginTop: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(41,41,39,.5)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  modal: { width: '100%', backgroundColor: C.paper, padding: 30, alignItems: 'center' },
  modalTitle: { color: C.text, fontSize: 23, fontWeight: '600', marginTop: 16 },
  activityNav: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  back: { color: C.text, fontSize: 27, fontWeight: '300' },
  activityTitle: { color: C.text, fontSize: 13, fontWeight: '800', marginTop: 2 },
  live: { flexDirection: 'row', alignItems: 'center' },
  liveText: { color: C.soft, fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  connected: {
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line,
    paddingVertical: 18, marginBottom: 25,
  },
  connectedName: {
    color: C.text, fontSize: 23, fontWeight: '600',
    letterSpacing: -0.6, marginTop: 7,
  },
  stepHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 28, marginBottom: 13,
  },
  stepNo: { color: C.coral, fontSize: 31, fontWeight: '300' },
  stepLine: { flex: 1, height: 1, backgroundColor: C.line, marginHorizontal: 13 },
  stepLabel: {
    color: C.soft, fontSize: 7, fontWeight: '900', letterSpacing: 1.3,
  },
  stepTitle: {
    color: C.text, fontSize: 29, lineHeight: 32,
    fontWeight: '500', letterSpacing: -0.8, marginBottom: 18,
  },
  activityBody: {
    color: C.soft, fontSize: 10, lineHeight: 16,
    maxWidth: 285, marginBottom: 20,
  },
  darkCard: {
    backgroundColor: C.charcoal, minHeight: 300,
    padding: 24, overflow: 'hidden',
  },
  darkCircle: {
    position: 'absolute', width: 170, height: 170, borderRadius: 85,
    backgroundColor: C.dark, right: -70, top: -60,
  },
  darkLabel: {
    color: C.coral, fontSize: 7, fontWeight: '900', letterSpacing: 1.5,
  },
  darkTitle: {
    color: C.paper, fontSize: 28, lineHeight: 31,
    fontWeight: '500', marginTop: 12,
  },
  darkBody: {
    color: '#C9C1B8', fontSize: 9, lineHeight: 14,
    maxWidth: 220, marginTop: 10,
  },
  readBox: {
    borderTopWidth: 1, borderTopColor: '#696965',
    marginTop: 20, paddingTop: 14,
  },
  readValue: { color: C.paper, fontSize: 14, fontWeight: '700', marginTop: 6 },
  darkAction: {
    marginTop: 22, minHeight: 50, borderTopWidth: 1,
    borderTopColor: '#696965', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  darkActionText: { color: C.paper, fontSize: 11, fontWeight: '800' },
  coralArrow: { color: C.coral, fontSize: 28 },
  field: {
    flexDirection: 'row', borderTopWidth: 1,
    borderTopColor: C.line, paddingVertical: 16,
  },
  fieldLetter: { width: 42, color: C.coral, fontSize: 10, fontWeight: '900' },
  inputLabel: {
    color: C.soft, fontSize: 7, fontWeight: '900',
    letterSpacing: 1.2, marginBottom: 7,
  },
  input: {
    color: C.text, fontSize: 15, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: C.text,
  },
  result: {
    backgroundColor: C.paper, minHeight: 330,
    padding: 24, overflow: 'hidden',
  },
  resultCircle: {
    position: 'absolute', width: 180, height: 180,
    borderRadius: 90, backgroundColor: C.coral,
    right: -105, top: -80, opacity: 0.9,
  },
  resultLabel: {
    color: C.coral, fontSize: 7, fontWeight: '900', letterSpacing: 1.5,
  },
  resultTitle: {
    color: C.text, fontSize: 31, lineHeight: 33,
    fontWeight: '500', marginTop: 12,
  },
  resultResponse: {
    color: C.soft, fontSize: 7, fontWeight: '900',
    letterSpacing: 1.2, marginTop: 24,
  },
  resultValue: {
    color: C.text, fontSize: 24, fontWeight: '800',
    marginTop: 6, marginBottom: 12,
  },
  waiting: {
    color: C.coral, fontSize: 48, fontWeight: '300', marginTop: 14,
  },
  resultDescription: {
    color: C.soft, fontSize: 9, lineHeight: 14, maxWidth: 225,
  },
  resultButton: {
    minHeight: 52, marginTop: 22, borderTopWidth: 1,
    borderTopColor: C.line, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  resultButtonText: { color: C.text, fontSize: 11, fontWeight: '900' },
  config: {
    marginTop: 30, borderTopWidth: 1,
    borderBottomWidth: 1, borderColor: C.line, paddingVertical: 18,
  },
  configTitle: {
    color: C.text, fontSize: 10, fontWeight: '900',
    letterSpacing: 1.2, marginBottom: 15,
  },
  configLabel: {
    color: C.coral, fontSize: 7, fontWeight: '900',
    letterSpacing: 1.2, marginTop: 8,
  },
  configValue: { color: C.soft, fontSize: 8, marginTop: 4 },
  exit: {
    minHeight: 58, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  exitText: { color: C.text, fontSize: 11, fontWeight: '800' },
});
