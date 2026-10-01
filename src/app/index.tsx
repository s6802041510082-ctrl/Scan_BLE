import { Buffer } from 'buffer';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

const manager = new BleManager();

/* =========================================================
   BLE CONFIG
========================================================= */

const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';
const CHAR_UUID_NOTIFY = 'cde07b1a-889b-44b7-a99f-c888dddac729';

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  const [receivedData, setReceivedData] = useState('');
  const [yourName, setYourName] = useState('');
  const [buddyName, setBuddyName] = useState('');

  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  const [hasRead, setHasRead] = useState(false);
  const [hasWritten, setHasWritten] = useState(false);
  const [hasFinalRead, setHasFinalRead] = useState(false);

  /* =========================================================
     PERMISSIONS
  ========================================================= */

  async function requestPermissions() {
    manager.stopDeviceScan();

    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return (
          granted['android.permission.BLUETOOTH_SCAN'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  }

  useEffect(() => {
    requestPermissions().then((granted) => {
      if (!granted) {
        console.log('Bluetooth permissions not granted');
      }
    });

    return () => {
      manager.stopDeviceScan();
    };
  }, []);

  /* =========================================================
     SCAN
  ========================================================= */

  const startScan = async () => {
    const granted = await requestPermissions();

    if (!granted) {
      Alert.alert(
        'Permission Required',
        'Bluetooth permission is required to scan for BLE devices.'
      );
      return;
    }

    manager.stopDeviceScan();

    setDevices([]);
    setIsScanning(true);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('Scan error:', error);
        setIsScanning(false);
        return;
      }

      if (device && device.name) {
        setDevices((previousDevices) => {
          const exists = previousDevices.some((d) => d.id === device.id);

          if (exists) {
            return previousDevices;
          }

          return [...previousDevices, device];
        });
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 8000);
  };

  /* =========================================================
     CONNECT
  ========================================================= */

  const connectToDevice = async (device: Device) => {
    manager.stopDeviceScan();

    setIsScanning(false);
    setIsConnecting(true);

    try {
      const connected = await manager.connectToDevice(device.id);

      const discovered =
        await connected.discoverAllServicesAndCharacteristics();

      setConnectedDevice(discovered);

      setReceivedData('');
      setHasRead(false);
      setHasWritten(false);
      setHasFinalRead(false);

      console.log('Connected to:', discovered.name);
    } catch (error) {
      console.log('Connection failed:', error);

      Alert.alert(
        'Connection Failed',
        'Unable to connect to this BLE device.'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  /* =========================================================
     READ
  ========================================================= */

  const readCharacteristic = async (finalRead = false) => {
    if (!connectedDevice) {
      return;
    }

    setIsReading(true);

    try {
      const deviceId = connectedDevice.id.toString();

      const characteristic =
        await manager.readCharacteristicForDevice(
          deviceId,
          SERVICE_UUID,
          CHAR_UUID
        );

      const rawData = Buffer.from(
        characteristic.value || '',
        'base64'
      ).toString('ascii');

      setReceivedData(rawData);

      if (finalRead) {
        setHasFinalRead(true);
      } else {
        setHasRead(true);
      }

      console.log('Read Value:', rawData);
    } catch (error) {
      console.log('Read failed:', error);

      Alert.alert(
        'Read Failed',
        'Unable to read the characteristic value.'
      );
    } finally {
      setIsReading(false);
    }
  };

  /* =========================================================
     WRITE
  ========================================================= */

  const writeCharacteristic = async () => {
    if (!connectedDevice) {
      return;
    }

    if (!yourName.trim() || !buddyName.trim()) {
      Alert.alert(
        'Names Required',
        'Please enter both your name and your buddy’s name.'
      );
      return;
    }

    setIsWriting(true);

    try {
      /*
        Change this line only if the teacher specifies
        another format.

        Current format:
        Your Name, Buddy Name
      */
      const valueToWrite = `${yourName.trim()}, ${buddyName.trim()}`;

      const base64Value = Buffer.from(
        valueToWrite,
        'utf-8'
      ).toString('base64');

      const deviceId = connectedDevice.id.toString();

      await manager.writeCharacteristicWithResponseForDevice(
        deviceId,
        SERVICE_UUID,
        CHAR_UUID,
        base64Value
      );

      setHasWritten(true);
      setHasFinalRead(false);
      setReceivedData('');

      Alert.alert(
        'Names Sent',
        `"${valueToWrite}" was written successfully.\n\nNow read again to reveal the result.`
      );

      console.log('Write Value:', valueToWrite);
    } catch (error) {
      console.log('Write failed:', error);

      Alert.alert(
        'Write Failed',
        'Unable to write data to the BLE device.'
      );
    } finally {
      setIsWriting(false);
    }
  };

  /* =========================================================
     NOTIFICATION
  ========================================================= */

  const startNotificationStream = () => {
    if (!connectedDevice) {
      return;
    }

    manager.monitorCharacteristicForDevice(
      connectedDevice.id,
      SERVICE_UUID,
      CHAR_UUID_NOTIFY,
      (error, char) => {
        if (error) {
          console.log('Notification error:', error);
          return;
        }

        if (char?.value) {
          const rawData = Buffer.from(
            char.value,
            'base64'
          ).toString('ascii');

          setReceivedData(rawData);
        }
      }
    );
  };

  /* =========================================================
     DISCONNECT
  ========================================================= */

  const disconnectDevice = async () => {
    if (!connectedDevice) {
      return;
    }

    try {
      await manager.cancelDeviceConnection(
        connectedDevice.id
      );
    } catch (error) {
      console.log('Disconnect error:', error);
    }

    setConnectedDevice(null);
    setReceivedData('');
    setYourName('');
    setBuddyName('');
    setHasRead(false);
    setHasWritten(false);
    setHasFinalRead(false);

    Alert.alert(
      'Disconnected',
      'The BLE device has been disconnected.'
    );
  };

  /* =========================================================
     SCAN SCREEN
  ========================================================= */

  const renderScanScreen = () => {
    return (
      <View style={styles.screen}>
        {/* Decorative background */}
        <View style={styles.glowTop} />
        <View style={styles.glowRight} />

        <View style={styles.hero}>
          <View style={styles.logo}>
            <Text style={styles.logoIcon}>B</Text>
          </View>

          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>BLUETOOTH LOW ENERGY</Text>
            <Text style={styles.appTitle}>
              BLE Grade{'\n'}Checker
            </Text>

            <Text style={styles.subtitle}>
              Connect. Send your names.{'\n'}
              Reveal your result.
            </Text>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusDot,
                isScanning && styles.statusDotScanning,
              ]}
            />

            <View>
              <Text style={styles.statusLabel}>BLUETOOTH</Text>

              <Text style={styles.statusText}>
                {isScanning
                  ? 'Searching for devices...'
                  : 'Ready to discover'}
              </Text>
            </View>
          </View>

          <View style={styles.readyBadge}>
            <Text style={styles.readyBadgeText}>
              {isScanning ? 'SCANNING' : 'READY'}
            </Text>
          </View>
        </View>

        {/* Main panel */}
        <View style={styles.mainPanel}>
          <View style={styles.scanIllustration}>
            <View style={styles.bluetoothCircle}>
              <Text style={styles.bluetoothSymbol}>ᛒ</Text>
            </View>

            <View style={styles.signalOne} />
            <View style={styles.signalTwo} />
          </View>

          <Text style={styles.panelTitle}>
            Find your BLE device
          </Text>

          <Text style={styles.panelDescription}>
            Scan for nearby Bluetooth devices and select
            your teacher&apos;s device to begin.
          </Text>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.primaryButton,
              isScanning && styles.primaryButtonDisabled,
            ]}
            onPress={startScan}
            disabled={isScanning}
          >
            <Text style={styles.primaryButtonIcon}>
              {isScanning ? '•••' : '⌁'}
            </Text>

            <Text style={styles.primaryButtonText}>
              {isScanning
                ? 'SCANNING...'
                : 'SCAN FOR DEVICES'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Devices */}
        <View style={styles.deviceHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>
              DISCOVERED
            </Text>

            <Text style={styles.sectionTitle}>
              Nearby Devices
            </Text>
          </View>

          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {devices.length}
            </Text>
          </View>
        </View>

        {devices.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>⌁</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No devices yet
            </Text>

            <Text style={styles.emptyDescription}>
              Press Scan for Devices to search for nearby
              Bluetooth Low Energy devices.
            </Text>
          </View>
        ) : (
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.deviceList}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.deviceCard}
                onPress={() => connectToDevice(item)}
                disabled={isConnecting}
              >
                <View style={styles.deviceIcon}>
                  <Text style={styles.deviceIconText}>
                    B
                  </Text>
                </View>

                <View style={styles.deviceInfo}>
                  <Text
                    style={styles.deviceName}
                    numberOfLines={1}
                  >
                    {item.name || 'BLE Device'}
                  </Text>

                  <Text
                    style={styles.deviceId}
                    numberOfLines={1}
                  >
                    {item.id}
                  </Text>
                </View>

                <View style={styles.deviceRight}>
                  {item.rssi !== null && (
                    <Text style={styles.rssi}>
                      {item.rssi} dBm
                    </Text>
                  )}

                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {isConnecting && (
          <View style={styles.connectingOverlay}>
            <View style={styles.connectingBox}>
              <Text style={styles.connectingDots}>•••</Text>

              <Text style={styles.connectingTitle}>
                Connecting
              </Text>

              <Text style={styles.connectingText}>
                Please wait while we connect to the BLE
                device.
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  /* =========================================================
     CONNECTED SCREEN
  ========================================================= */

  const renderConnectedScreen = () => {
    return (
      <View style={styles.screen}>
        <View style={styles.glowTop} />
        <View style={styles.glowRight} />

        {/* Header */}
        <View style={styles.connectedHeader}>
          <View>
            <Text style={styles.eyebrow}>
              BLE GRADE CHECKER
            </Text>

            <Text style={styles.connectedHeading}>
              Device Connected
            </Text>
          </View>

          <View style={styles.connectedBadge}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedBadgeText}>
              LIVE
            </Text>
          </View>
        </View>

        {/* Device */}
        <View style={styles.connectedDeviceCard}>
          <View style={styles.connectedDeviceIcon}>
            <Text style={styles.connectedDeviceIconText}>
              B
            </Text>
          </View>

          <View style={styles.connectedDeviceInfo}>
            <Text style={styles.connectedLabel}>
              CONNECTED TO
            </Text>

            <Text
              style={styles.connectedDeviceName}
              numberOfLines={1}
            >
              {connectedDevice?.name || 'BLE Device'}
            </Text>

            <Text
              style={styles.connectedDeviceId}
              numberOfLines={1}
            >
              {connectedDevice?.id}
            </Text>
          </View>
        </View>

        {/* Steps */}
        <View style={styles.steps}>
          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                hasRead && styles.stepCircleDone,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  hasRead && styles.stepNumberDone,
                ]}
              >
                {hasRead ? '✓' : '1'}
              </Text>
            </View>

            <Text style={styles.stepLabel}>READ</Text>
          </View>

          <View
            style={[
              styles.stepLine,
              hasRead && styles.stepLineDone,
            ]}
          />

          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                hasWritten && styles.stepCircleDone,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  hasWritten && styles.stepNumberDone,
                ]}
              >
                {hasWritten ? '✓' : '2'}
              </Text>
            </View>

            <Text style={styles.stepLabel}>WRITE</Text>
          </View>

          <View
            style={[
              styles.stepLine,
              hasWritten && styles.stepLineDone,
            ]}
          />

          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepCircle,
                hasFinalRead && styles.stepCircleDone,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  hasFinalRead && styles.stepNumberDone,
                ]}
              >
                {hasFinalRead ? '✓' : '3'}
              </Text>
            </View>

            <Text style={styles.stepLabel}>RESULT</Text>
          </View>
        </View>

        {/* STEP 1 */}
        <View style={styles.actionCard}>
          <View style={styles.actionCardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>01</Text>
            </View>

            <View>
              <Text style={styles.actionEyebrow}>
                FIRST STEP
              </Text>

              <Text style={styles.actionTitle}>
                Read from device
              </Text>
            </View>
          </View>

          <Text style={styles.actionDescription}>
            Read the current characteristic value from the
            teacher&apos;s BLE device.
          </Text>

          {!hasWritten && receivedData ? (
            <View style={styles.valueBox}>
              <Text style={styles.valueLabel}>
                RECEIVED VALUE
              </Text>

              <Text style={styles.valueText}>
                {receivedData}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.secondaryButton}
            onPress={() => readCharacteristic(false)}
            disabled={isReading}
          >
            <Text style={styles.secondaryButtonText}>
              {isReading ? 'READING...' : 'READ VALUE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* STEP 2 */}
        <View style={styles.actionCard}>
          <View style={styles.actionCardHeader}>
            <View style={styles.numberBadge}>
              <Text style={styles.numberBadgeText}>02</Text>
            </View>

            <View>
              <Text style={styles.actionEyebrow}>
                SECOND STEP
              </Text>

              <Text style={styles.actionTitle}>
                Send your names
              </Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>
            Your name
          </Text>

          <TextInput
            style={styles.input}
            value={yourName}
            onChangeText={setYourName}
            placeholder="Enter your name"
            placeholderTextColor="#8290A8"
          />

          <Text style={styles.inputLabel}>
            Buddy&apos;s name
          </Text>

          <TextInput
            style={styles.input}
            value={buddyName}
            onChangeText={setBuddyName}
            placeholder="Enter your buddy's name"
            placeholderTextColor="#8290A8"
          />

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.primaryButton}
            onPress={writeCharacteristic}
            disabled={isWriting}
          >
            <Text style={styles.primaryButtonText}>
              {isWriting ? 'SENDING...' : 'SEND NAMES'}
            </Text>

            <Text style={styles.buttonArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* STEP 3 */}
        <View
          style={[
            styles.resultCard,
            hasFinalRead && styles.resultCardActive,
          ]}
        >
          <View style={styles.actionCardHeader}>
            <View
              style={[
                styles.numberBadge,
                hasFinalRead && styles.numberBadgeSuccess,
              ]}
            >
              <Text
                style={[
                  styles.numberBadgeText,
                  hasFinalRead &&
                    styles.numberBadgeTextSuccess,
                ]}
              >
                03
              </Text>
            </View>

            <View>
              <Text style={styles.actionEyebrow}>
                FINAL STEP
              </Text>

              <Text style={styles.actionTitle}>
                Reveal your result
              </Text>
            </View>
          </View>

          {hasFinalRead && receivedData ? (
            <View style={styles.gradeBox}>
              <Text style={styles.gradeLabel}>
                DEVICE RESPONSE
              </Text>

              <Text style={styles.gradeValue}>
                {receivedData}
              </Text>

              <Text style={styles.gradeCaption}>
                Result received successfully
              </Text>
            </View>
          ) : (
            <View style={styles.lockedResult}>
              <Text style={styles.lockedIcon}>◇</Text>

              <Text style={styles.lockedTitle}>
                Result waiting
              </Text>

              <Text style={styles.lockedText}>
                Send your names, then read the
                characteristic again.
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.resultButton,
              !hasWritten && styles.disabledButton,
            ]}
            disabled={!hasWritten || isReading}
            onPress={() => readCharacteristic(true)}
          >
            <Text style={styles.resultButtonText}>
              {isReading
                ? 'READING...'
                : 'READ AGAIN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Disconnect */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.disconnectButton}
          onPress={disconnectDevice}
        >
          <Text style={styles.disconnectText}>
            Disconnect Device
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Bluetooth Low Energy • BLE Grade Checker
        </Text>
      </View>
    );
  };

  /* =========================================================
     MAIN
  ========================================================= */

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#071A35"
      />

      <FlatList
        data={[1]}
        keyExtractor={() => 'main'}
        renderItem={() =>
          connectedDevice
            ? renderConnectedScreen()
            : renderScanScreen()
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      />
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071A35',
  },

  scrollContent: {
    flexGrow: 1,
  },

  screen: {
    flex: 1,
    minHeight: 780,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 45,
    backgroundColor: '#071A35',
    overflow: 'hidden',
  },

  /* BACKGROUND */

  glowTop: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#0C3470',
    opacity: 0.35,
    top: -170,
    right: -80,
  },

  glowRight: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#075985',
    opacity: 0.16,
    top: 300,
    right: -180,
  },

  /* HERO */

  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 28,
  },

  logo: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,

    shadowColor: '#2563EB',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  logoIcon: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  heroText: {
    flex: 1,
  },

  eyebrow: {
    color: '#64C7FF',
    fontSize: 10,
    letterSpacing: 2.2,
    fontWeight: '800',
    marginBottom: 6,
  },

  appTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 37,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  subtitle: {
    color: '#9EB1CA',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  /* STATUS */

  statusCard: {
    backgroundColor: '#0D2647',
    borderWidth: 1,
    borderColor: '#173B68',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 12,
  },

  statusDotScanning: {
    backgroundColor: '#38BDF8',
  },

  statusLabel: {
    color: '#6F8DB2',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  statusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },

  readyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#123A66',
  },

  readyBadgeText: {
    color: '#60CFFF',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '900',
  },

  /* MAIN PANEL */

  mainPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 25,
    alignItems: 'center',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },

  scanIllustration: {
    width: 90,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  bluetoothCircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#EAF3FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  bluetoothSymbol: {
    color: '#2563EB',
    fontSize: 28,
    fontWeight: '900',
  },

  signalOne: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderWidth: 1,
    borderColor: '#DCEAFF',
    borderRadius: 38,
  },

  signalTwo: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderWidth: 1,
    borderColor: '#EEF5FF',
    borderRadius: 44,
  },

  panelTitle: {
    color: '#10213B',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 6,
  },

  panelDescription: {
    color: '#687991',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 290,
  },

  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    marginTop: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',

    shadowColor: '#2563EB',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },

  primaryButtonDisabled: {
    backgroundColor: '#5677AE',
  },

  primaryButtonIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginRight: 8,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '900',
  },

  buttonArrow: {
    position: 'absolute',
    right: 20,
    color: '#FFFFFF',
    fontSize: 19,
  },

  /* DEVICES */

  deviceHeader: {
    marginTop: 26,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },

  sectionEyebrow: {
    color: '#5A789E',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 3,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  counter: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#12345E',
    justifyContent: 'center',
    alignItems: 'center',
  },

  counterText: {
    color: '#65D4FF',
    fontWeight: '900',
    fontSize: 12,
  },

  emptyCard: {
    minHeight: 155,
    backgroundColor: '#0C2341',
    borderWidth: 1,
    borderColor: '#153A64',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  emptyIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#12355E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  emptyIconText: {
    color: '#58C8FF',
    fontSize: 23,
  },

  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyDescription: {
    color: '#7289A7',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
  },

  deviceList: {
    gap: 10,
  },

  deviceCard: {
    minHeight: 76,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E9F2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  deviceIconText: {
    color: '#2563EB',
    fontSize: 17,
    fontWeight: '900',
  },

  deviceInfo: {
    flex: 1,
  },

  deviceName: {
    color: '#12213A',
    fontSize: 14,
    fontWeight: '800',
  },

  deviceId: {
    color: '#8A97A9',
    fontSize: 9,
    marginTop: 5,
  },

  deviceRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },

  rssi: {
    color: '#60738D',
    fontSize: 10,
  },

  chevron: {
    color: '#2563EB',
    fontSize: 24,
    lineHeight: 25,
  },

  /* CONNECTING */

  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,15,32,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },

  connectingBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    padding: 28,
    alignItems: 'center',
  },

  connectingDots: {
    color: '#2563EB',
    fontSize: 28,
    letterSpacing: 5,
  },

  connectingTitle: {
    color: '#10213B',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
  },

  connectingText: {
    color: '#75849A',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
  },

  /* CONNECTED HEADER */

  connectedHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  connectedHeading: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
  },

  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C3C46',
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
    marginRight: 6,
  },

  connectedBadgeText: {
    color: '#6EE7B7',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '900',
  },

  /* CONNECTED DEVICE */

  connectedDeviceCard: {
    backgroundColor: '#0D2647',
    borderWidth: 1,
    borderColor: '#173B68',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },

  connectedDeviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },

  connectedDeviceIconText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },

  connectedDeviceInfo: {
    flex: 1,
  },

  connectedLabel: {
    color: '#61C8FF',
    fontSize: 8,
    letterSpacing: 1.4,
    fontWeight: '900',
  },

  connectedDeviceName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },

  connectedDeviceId: {
    color: '#7790AD',
    fontSize: 9,
    marginTop: 4,
  },

  /* STEPS */

  steps: {
    marginVertical: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepItem: {
    alignItems: 'center',
  },

  stepCircle: {
    width: 35,
    height: 35,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#315276',
    backgroundColor: '#0B213E',
    justifyContent: 'center',
    alignItems: 'center',
  },

  stepCircleDone: {
    borderColor: '#38BDF8',
    backgroundColor: '#0C4A6E',
  },

  stepNumber: {
    color: '#6E89A8',
    fontSize: 12,
    fontWeight: '900',
  },

  stepNumberDone: {
    color: '#7DD3FC',
  },

  stepLabel: {
    color: '#7187A2',
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '900',
    marginTop: 6,
  },

  stepLine: {
    width: 50,
    height: 2,
    backgroundColor: '#244464',
    marginHorizontal: 7,
    marginBottom: 19,
  },

  stepLineDone: {
    backgroundColor: '#38BDF8',
  },

  /* ACTION CARDS */

  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },

  actionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  numberBadge: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#EAF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  numberBadgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },

  numberBadgeSuccess: {
    backgroundColor: '#DCFCE7',
  },

  numberBadgeTextSuccess: {
    color: '#16A34A',
  },

  actionEyebrow: {
    color: '#8A9AB0',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  actionTitle: {
    color: '#10213B',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },

  actionDescription: {
    color: '#748399',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
  },

  secondaryButton: {
    minHeight: 49,
    borderRadius: 14,
    backgroundColor: '#EAF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
  },

  secondaryButtonText: {
    color: '#1D5FD2',
    fontSize: 11,
    letterSpacing: 0.7,
    fontWeight: '900',
  },

  valueBox: {
    backgroundColor: '#F4F8FD',
    borderRadius: 14,
    padding: 14,
    marginTop: 15,
  },

  valueLabel: {
    color: '#8A9BB1',
    fontSize: 8,
    letterSpacing: 1.3,
    fontWeight: '900',
  },

  valueText: {
    color: '#12213A',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 5,
  },

  /* INPUT */

  inputLabel: {
    color: '#45566E',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 7,
  },

  input: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: '#DDE6F1',
    paddingHorizontal: 15,
    color: '#10213B',
    fontSize: 13,
  },

  /* RESULT */

  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },

  resultCardActive: {
    borderWidth: 2,
    borderColor: '#38BDF8',
  },

  lockedResult: {
    alignItems: 'center',
    backgroundColor: '#F6F8FB',
    borderRadius: 17,
    padding: 18,
    marginTop: 16,
  },

  lockedIcon: {
    color: '#8DA1B9',
    fontSize: 25,
  },

  lockedTitle: {
    color: '#43546A',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },

  lockedText: {
    color: '#8A99AB',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 5,
  },

  gradeBox: {
    backgroundColor: '#071A35',
    borderRadius: 18,
    paddingVertical: 23,
    paddingHorizontal: 15,
    marginTop: 16,
    alignItems: 'center',
  },

  gradeLabel: {
    color: '#6DA5CE',
    fontSize: 8,
    letterSpacing: 1.7,
    fontWeight: '900',
  },

  gradeValue: {
    color: '#7DD3FC',
    fontSize: 35,
    lineHeight: 44,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },

  gradeCaption: {
    color: '#7790AD',
    fontSize: 10,
    marginTop: 3,
  },

  resultButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#102C50',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },

  resultButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.35,
  },

  /* DISCONNECT */

  disconnectButton: {
    height: 49,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#34516F',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },

  disconnectText: {
    color: '#91A8C2',
    fontSize: 11,
    fontWeight: '800',
  },

  footerText: {
    color: '#496684',
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 0.5,
    marginTop: 20,
  },
});