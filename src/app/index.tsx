import { Buffer } from 'buffer';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
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
import {
  BleManager,
  Device,
  State,
} from 'react-native-ble-plx';

const SERVICE_UUID =
  'aee04821-1973-4e1f-a590-e84b10d580e7';

const CHAR_UUID =
  'cde07b1a-889b-44b7-a99f-c888dddac729';

const COLORS = {
  background: '#EEE6D5',
  paper: '#FFF9EF',
  coral: '#F45B5D',
  text: '#1D1D1B',
  muted: '#69655E',
  line: '#B9B0A0',
  green: '#57957E',
  white: '#FFFFFF',
};

export default function Index() {
  const manager = useRef(new BleManager()).current;

  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [bluetoothReady, setBluetoothReady] =
    useState(false);

  const [connectingId, setConnectingId] =
    useState<string | null>(null);

  const [connectedDevice, setConnectedDevice] =
    useState<Device | null>(null);

  const [screen, setScreen] =
    useState<'scan' | 'activity'>('scan');

  const [myName, setMyName] = useState('');
  const [buddyName, setBuddyName] = useState('');

  const [initialValue, setInitialValue] =
    useState('');

  const [grade, setGrade] = useState('');

  const [initialReadDone, setInitialReadDone] =
    useState(false);

  const [writeDone, setWriteDone] =
    useState(false);

  const [isReading, setIsReading] =
    useState(false);

  const [isWriting, setIsWriting] =
    useState(false);

  useEffect(() => {
    const subscription = manager.onStateChange(
      (state) => {
        setBluetoothReady(
          state === State.PoweredOn
        );
      },
      true
    );

    return () => {
      subscription.remove();
      manager.stopDeviceScan();
    };
  }, [manager]);

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      if (Platform.Version >= 31) {
        const result =
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS
              .BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS
              .BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS
              .ACCESS_FINE_LOCATION,
          ]);

        const scanGranted =
          result[
            PermissionsAndroid.PERMISSIONS
              .BLUETOOTH_SCAN
          ] === PermissionsAndroid.RESULTS.GRANTED;

        const connectGranted =
          result[
            PermissionsAndroid.PERMISSIONS
              .BLUETOOTH_CONNECT
          ] === PermissionsAndroid.RESULTS.GRANTED;

        const locationGranted =
          result[
            PermissionsAndroid.PERMISSIONS
              .ACCESS_FINE_LOCATION
          ] === PermissionsAndroid.RESULTS.GRANTED;

        return (
          scanGranted &&
          connectGranted &&
          locationGranted
        );
      }

      const locationPermission =
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS
            .ACCESS_FINE_LOCATION
        );

      return (
        locationPermission ===
        PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.log(
        'Permission error:',
        error
      );

      return false;
    }
  };

  const scanDevices = async () => {
    if (isScanning) {
      manager.stopDeviceScan();
      setIsScanning(false);
      return;
    }

    const permissionGranted =
      await requestPermissions();

    if (!permissionGranted) {
      Alert.alert(
        'Permission required',
        'Bluetooth permission is required to scan nearby devices.'
      );
      return;
    }

    const state = await manager.state();

    if (state !== State.PoweredOn) {
      Alert.alert(
        'Bluetooth is off',
        'Please turn on Bluetooth before scanning.'
      );
      return;
    }

    setDevices([]);
    setIsScanning(true);

    manager.stopDeviceScan();

    manager.startDeviceScan(
      null,
      null,
      (error, device) => {
        if (error) {
          console.log(
            'Scan error:',
            error
          );

          manager.stopDeviceScan();
          setIsScanning(false);

          Alert.alert(
            'Scan failed',
            error.message ||
              'Unable to scan for BLE devices.'
          );

          return;
        }

        if (!device) {
          return;
        }

        setDevices((currentDevices) => {
          const index =
            currentDevices.findIndex(
              (currentDevice) =>
                currentDevice.id === device.id
            );

          if (index >= 0) {
            const updated =
              [...currentDevices];

            updated[index] = device;

            return updated;
          }

          return [
            ...currentDevices,
            device,
          ];
        });
      }
    );

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  const connectDevice = async (
    device: Device
  ) => {
    manager.stopDeviceScan();
    setIsScanning(false);
    setConnectingId(device.id);

    try {
      const connected =
        await manager.connectToDevice(
          device.id
        );

      const isConnected =
        await connected.isConnected();

      if (!isConnected) {
        throw new Error(
          'BLE connection was not established.'
        );
      }

      const discovered =
        await connected
          .discoverAllServicesAndCharacteristics();

      const services =
        await discovered.services();

      const targetService =
        services.find(
          (service) =>
            service.uuid.toLowerCase() ===
            SERVICE_UUID.toLowerCase()
        );

      if (!targetService) {
        await manager
          .cancelDeviceConnection(
            device.id
          )
          .catch(() => {});

        throw new Error(
          'Required BLE service was not found. This may not be the instructor device.'
        );
      }

      const characteristics =
        await targetService
          .characteristics();

      const targetCharacteristic =
        characteristics.find(
          (characteristic) =>
            characteristic.uuid
              .toLowerCase() ===
            CHAR_UUID.toLowerCase()
        );

      if (!targetCharacteristic) {
        await manager
          .cancelDeviceConnection(
            device.id
          )
          .catch(() => {});

        throw new Error(
          'Required BLE characteristic was not found.'
        );
      }

      if (
        !targetCharacteristic.isReadable
      ) {
        await manager
          .cancelDeviceConnection(
            device.id
          )
          .catch(() => {});

        throw new Error(
          'The BLE characteristic does not support reading.'
        );
      }

      const canWrite =
        targetCharacteristic
          .isWritableWithResponse ||
        targetCharacteristic
          .isWritableWithoutResponse;

      if (!canWrite) {
        await manager
          .cancelDeviceConnection(
            device.id
          )
          .catch(() => {});

        throw new Error(
          'The BLE characteristic does not support writing.'
        );
      }

      setConnectedDevice(discovered);

      setMyName('');
      setBuddyName('');
      setInitialValue('');
      setGrade('');

      setInitialReadDone(false);
      setWriteDone(false);

      setScreen('activity');
    } catch (error: any) {
      console.log(
        'Connection error:',
        error
      );

      setConnectedDevice(null);

      Alert.alert(
        'Connection failed',
        error?.message ||
          'Unable to connect to this BLE device.'
      );
    } finally {
      setConnectingId(null);
    }
  };

  const checkConnection =
    async () => {
      if (!connectedDevice) {
        Alert.alert(
          'Not connected',
          'Connect to a BLE device first.'
        );

        return false;
      }

      const isConnected =
        await connectedDevice
          .isConnected();

      if (!isConnected) {
        Alert.alert(
          'Device disconnected',
          'The BLE connection has been lost. Please connect again.'
        );

        setConnectedDevice(null);
        setInitialReadDone(false);
        setWriteDone(false);
        setScreen('scan');

        return false;
      }

      return true;
    };

  const readInitialValue =
    async () => {
      try {
        const connected =
          await checkConnection();

        if (!connected) {
          return;
        }

        if (!connectedDevice) {
          return;
        }

        setIsReading(true);

        const characteristic =
          await manager
            .readCharacteristicForDevice(
              connectedDevice.id,
              SERVICE_UUID,
              CHAR_UUID
            );

        const decodedValue =
          Buffer.from(
            characteristic.value || '',
            'base64'
          ).toString('utf8');

        setInitialValue(
          decodedValue ||
            'No data received'
        );

        setInitialReadDone(true);
        setWriteDone(false);
        setGrade('');
      } catch (error: any) {
        console.log(
          'Read error:',
          error
        );

        Alert.alert(
          'Read failed',
          error?.message ||
            'Unable to read characteristic.'
        );
      } finally {
        setIsReading(false);
      }
    };

  const writeNames = async () => {
    try {
      if (!initialReadDone) {
        Alert.alert(
          'Read first',
          'Read the characteristic before entering your details.'
        );

        return;
      }

      if (
        !myName.trim() ||
        !buddyName.trim()
      ) {
        Alert.alert(
          'Missing information',
          'Enter your name and your buddy name.'
        );

        return;
      }

      const connected =
        await checkConnection();

      if (!connected) {
        return;
      }

      if (!connectedDevice) {
        return;
      }

      setIsWriting(true);

      const valueToWrite =
        `${myName.trim()},${buddyName.trim()}`;

      const encodedValue =
        Buffer.from(
          valueToWrite,
          'utf8'
        ).toString('base64');

      await manager
        .writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          SERVICE_UUID,
          CHAR_UUID,
          encodedValue
        );

      setGrade('');
      setWriteDone(true);

      Alert.alert(
        'Write successful',
        'Names were sent to the BLE device. You can now read your grade.'
      );
    } catch (error: any) {
      console.log(
        'Write error:',
        error
      );

      Alert.alert(
        'Write failed',
        error?.message ||
          'Unable to write characteristic.'
      );
    } finally {
      setIsWriting(false);
    }
  };

  const readGrade = async () => {
    try {
      if (!writeDone) {
        Alert.alert(
          'Write first',
          'Send your names before reading the grade.'
        );

        return;
      }

      const connected =
        await checkConnection();

      if (!connected) {
        return;
      }

      if (!connectedDevice) {
        return;
      }

      setIsReading(true);

      const characteristic =
        await manager
          .readCharacteristicForDevice(
            connectedDevice.id,
            SERVICE_UUID,
            CHAR_UUID
          );

      const decodedValue =
        Buffer.from(
          characteristic.value || '',
          'base64'
        ).toString('utf8');

      setGrade(
        decodedValue ||
          'No data received'
      );
    } catch (error: any) {
      console.log(
        'Read grade error:',
        error
      );

      Alert.alert(
        'Read failed',
        error?.message ||
          'Unable to read grade.'
      );
    } finally {
      setIsReading(false);
    }
  };

  const disconnectDevice =
    async () => {
      if (connectedDevice) {
        try {
          const isConnected =
            await connectedDevice
              .isConnected();

          if (isConnected) {
            await manager
              .cancelDeviceConnection(
                connectedDevice.id
              );
          }
        } catch (error) {
          console.log(
            'Disconnect error:',
            error
          );
        }
      }

      setConnectedDevice(null);

      setMyName('');
      setBuddyName('');

      setInitialValue('');
      setGrade('');

      setInitialReadDone(false);
      setWriteDone(false);

      setScreen('scan');
    };

  const renderDevice = ({
    item,
  }: {
    item: Device;
  }) => {
    const isConnecting =
      connectingId === item.id;

    const deviceName =
      item.name ||
      item.localName ||
      'Unknown BLE Device';

    const serviceList =
      item.serviceUUIDs &&
      item.serviceUUIDs.length > 0
        ? item.serviceUUIDs.join(', ')
        : 'Not advertised';

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.deviceRow}
        onPress={() =>
          connectDevice(item)
        }
        disabled={
          isConnecting ||
          connectingId !== null
        }
      >
        <View
          style={styles.deviceDot}
        />

        <View
          style={styles.deviceInfo}
        >
          <Text
            style={styles.deviceName}
            numberOfLines={1}
          >
            {deviceName}
          </Text>

          <Text
            style={styles.deviceId}
            numberOfLines={1}
          >
            ID: {item.id}
          </Text>

          <Text
            style={styles.deviceDetail}
          >
            RSSI:{' '}
            {item.rssi !== null
              ? `${item.rssi} dBm`
              : 'N/A'}
          </Text>

          <Text
            style={styles.deviceDetail}
            numberOfLines={2}
          >
            Service: {serviceList}
          </Text>
        </View>

        <Text
          style={styles.deviceStatus}
        >
          {isConnecting
            ? 'CONNECTING'
            : 'CONNECT'}
        </Text>
      </TouchableOpacity>
    );
  };

  if (screen === 'activity') {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor={
            COLORS.background
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.activityPage
          }
        >
          <View
            style={styles.topDecoration}
          />

          <View style={styles.header}>
            <View>
              <Text
                style={styles.logo}
              >
                BLE Connect
              </Text>

              <Text
                style={
                  styles.headerSubtitle
                }
              >
                <Text
                  style={
                    styles.headerAccent
                  }
                >
                  READ
                </Text>
                {'  /  WRITE  /  CONNECT'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.backButton}
              onPress={
                disconnectDevice
              }
            >
              <Text
                style={
                  styles.backButtonText
                }
              >
                ←
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={styles.activityHero}
          >
            <View
              style={
                styles.activityHeroCircle
              }
            />

            <Text
              style={styles.heroEyebrow}
            >
              DEVICE CONNECTED
            </Text>

            <Text
              style={
                styles.activityHeroTitle
              }
            >
              Ready to
            </Text>

            <Text
              style={
                styles.activityHeroAccent
              }
            >
              read.
            </Text>

            <Text
              style={
                styles.activityHeroDescription
              }
            >
              Read the BLE value first,
              then enter your details and
              receive your grade.
            </Text>

            <Text
              style={
                styles.activityHeroNumber
              }
            >
              01
            </Text>
          </View>

          <View
            style={
              styles.connectedStatus
            }
          >
            <View
              style={styles.statusDot}
            />

            <View
              style={
                styles.statusContent
              }
            >
              <Text
                style={
                  styles.statusTitle
                }
              >
                Connected
              </Text>

              <Text
                style={
                  styles.statusDescription
                }
                numberOfLines={1}
              >
                {connectedDevice?.name ||
                  connectedDevice
                    ?.localName ||
                  'BLE Device'}
              </Text>
            </View>

            <Text
              style={styles.readyLabel}
            >
              READY
            </Text>
          </View>

          <View
            style={
              styles.activitySection
            }
          >
            <View
              style={
                styles.activityHeading
              }
            >
              <Text
                style={
                  styles.sectionNumber
                }
              >
                01
              </Text>

              <View
                style={
                  styles.sectionText
                }
              >
                <Text
                  style={
                    styles.activityTitle
                  }
                >
                  Read characteristic.
                </Text>

                <Text
                  style={
                    styles.activityDescription
                  }
                >
                  Read the current value
                  from the connected BLE
                  device.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={
                styles.outlineButton
              }
              activeOpacity={0.8}
              onPress={
                readInitialValue
              }
              disabled={
                isReading ||
                isWriting
              }
            >
              <Text
                style={
                  styles.outlineButtonNumber
                }
              >
                01
              </Text>

              <Text
                style={
                  styles.outlineButtonText
                }
              >
                {isReading
                  ? 'Reading...'
                  : initialReadDone
                    ? 'Read again'
                    : 'Read'}
              </Text>

              <Text
                style={
                  styles.outlineButtonArrow
                }
              >
                →
              </Text>
            </TouchableOpacity>

            {initialValue ? (
              <View
                style={styles.valueBox}
              >
                <Text
                  style={
                    styles.valueLabel
                  }
                >
                  RECEIVED VALUE
                </Text>

                <Text
                  style={
                    styles.valueText
                  }
                >
                  {initialValue}
                </Text>
              </View>
            ) : null}
          </View>

          {initialReadDone && (
            <View
              style={
                styles.activitySection
              }
            >
              <View
                style={
                  styles.activityHeading
                }
              >
                <Text
                  style={
                    styles.sectionNumber
                  }
                >
                  02
                </Text>

                <View
                  style={
                    styles.sectionText
                  }
                >
                  <Text
                    style={
                      styles.activityTitle
                    }
                  >
                    Enter your details.
                  </Text>

                  <Text
                    style={
                      styles.activityDescription
                    }
                  >
                    Enter your name and
                    your buddy's name,
                    then send them to the
                    BLE device.
                  </Text>
                </View>
              </View>

              <Text
                style={
                  styles.inputLabel
                }
              >
                YOUR NAME
              </Text>

              <TextInput
                style={styles.input}
                value={myName}
                onChangeText={(text) => {
                  setMyName(text);
                  setWriteDone(false);
                  setGrade('');
                }}
                placeholder="Enter your name"
                placeholderTextColor="#9D9589"
                autoCapitalize="words"
              />

              <Text
                style={
                  styles.inputLabel
                }
              >
                BUDDY NAME
              </Text>

              <TextInput
                style={styles.input}
                value={buddyName}
                onChangeText={(text) => {
                  setBuddyName(text);
                  setWriteDone(false);
                  setGrade('');
                }}
                placeholder="Enter your buddy's name"
                placeholderTextColor="#9D9589"
                autoCapitalize="words"
              />

              <TouchableOpacity
                style={
                  styles.primaryButton
                }
                activeOpacity={0.85}
                onPress={writeNames}
                disabled={
                  isWriting ||
                  isReading
                }
              >
                <Text
                  style={
                    styles.primaryButtonNumber
                  }
                >
                  02
                </Text>

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  {isWriting
                    ? 'Writing...'
                    : writeDone
                      ? 'Write again'
                      : 'Write names'}
                </Text>

                <Text
                  style={
                    styles.primaryButtonArrow
                  }
                >
                  →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {writeDone && (
            <View
              style={
                styles.activitySection
              }
            >
              <View
                style={
                  styles.activityHeading
                }
              >
                <Text
                  style={
                    styles.sectionNumber
                  }
                >
                  03
                </Text>

                <View
                  style={
                    styles.sectionText
                  }
                >
                  <Text
                    style={
                      styles.activityTitle
                    }
                  >
                    Read your grade.
                  </Text>

                  <Text
                    style={
                      styles.activityDescription
                    }
                  >
                    Read the
                    characteristic again
                    to receive the result
                    from the BLE device.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={
                  styles.darkButton
                }
                activeOpacity={0.85}
                onPress={readGrade}
                disabled={
                  isReading ||
                  isWriting
                }
              >
                <Text
                  style={
                    styles.darkButtonNumber
                  }
                >
                  03
                </Text>

                <Text
                  style={
                    styles.darkButtonText
                  }
                >
                  {isReading
                    ? 'Reading...'
                    : 'Read grade'}
                </Text>

                <Text
                  style={
                    styles.darkButtonArrow
                  }
                >
                  →
                </Text>
              </TouchableOpacity>

              {grade !== '' && (
                <View
                  style={
                    styles.gradeCard
                  }
                >
                  <Text
                    style={
                      styles.gradeLabel
                    }
                  >
                    GRADE RESULT
                  </Text>

                  <Text
                    style={
                      styles.gradeValue
                    }
                  >
                    {grade}
                  </Text>

                  <Text
                    style={
                      styles.gradeHint
                    }
                  >
                    Result received from
                    the BLE device
                  </Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={
              styles.disconnectButton
            }
            onPress={
              disconnectDevice
            }
          >
            <Text
              style={
                styles.disconnectText
              }
            >
              Disconnect and return
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={
          COLORS.background
        }
      />

      <FlatList
        data={devices}
        keyExtractor={(item) =>
          item.id
        }
        renderItem={renderDevice}
        showsVerticalScrollIndicator={
          false
        }
        contentContainerStyle={
          styles.page
        }
        ListHeaderComponent={
          <>
            <View
              style={
                styles.topDecoration
              }
            />

            <View
              style={styles.header}
            >
              <View>
                <Text
                  style={styles.logo}
                >
                  BLE Connect
                </Text>

                <Text
                  style={
                    styles.headerSubtitle
                  }
                >
                  <Text
                    style={
                      styles.headerAccent
                    }
                  >
                    READ
                  </Text>
                  {'  /  WRITE  /  CONNECT'}
                </Text>
              </View>

              <View
                style={
                  styles.menuButton
                }
              >
                <View
                  style={
                    styles.menuLine
                  }
                />
                <View
                  style={
                    styles.menuLine
                  }
                />
                <View
                  style={
                    styles.menuLine
                  }
                />
              </View>
            </View>

            <View
              style={styles.heroCard}
            >
              <View
                style={
                  styles.heroCircleLarge
                }
              />

              <View
                style={
                  styles.heroCircleOutline
                }
              />

              <Text
                style={
                  styles.heroEyebrow
                }
              >
                BLUETOOTH LOW ENERGY
              </Text>

              <Text
                style={
                  styles.heroTitle
                }
              >
                Ready to
              </Text>

              <Text
                style={
                  styles.heroTitleAccent
                }
              >
                connect?
              </Text>

              <Text
                style={
                  styles.heroDescription
                }
              >
                Find your instructor's
                {'\n'}
                Bluetooth device and
                {'\n'}
                begin the activity.
              </Text>

              <Text
                style={
                  styles.heroNumber
                }
              >
                01
              </Text>

              <Text
                style={
                  styles.heroArrow
                }
              >
                →
              </Text>
            </View>

            <View
              style={
                styles.sectionIntro
              }
            >
              <Text
                style={
                  styles.sectionNumber
                }
              >
                01
              </Text>

              <View
                style={
                  styles.sectionText
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Connect to your{'\n'}
                  BLE device.
                </Text>

                <Text
                  style={
                    styles.sectionDescription
                  }
                >
                  Search for a nearby
                  Bluetooth Low Energy
                  device provided by your
                  instructor.
                </Text>
              </View>
            </View>

            <View
              style={
                styles.bluetoothStatus
              }
            >
              <View
                style={[
                  styles.statusDot,
                  !bluetoothReady &&
                    styles.statusDotOff,
                ]}
              />

              <View
                style={
                  styles.statusContent
                }
              >
                <Text
                  style={
                    styles.statusTitle
                  }
                >
                  {bluetoothReady
                    ? 'Bluetooth ready'
                    : 'Bluetooth unavailable'}
                </Text>

                <Text
                  style={
                    styles.statusDescription
                  }
                >
                  {bluetoothReady
                    ? 'Ready when you are'
                    : 'Turn on Bluetooth to continue'}
                </Text>
              </View>

              <Text
                style={[
                  styles.readyLabel,
                  !bluetoothReady &&
                    styles.notReadyLabel,
                ]}
              >
                {bluetoothReady
                  ? 'READY'
                  : 'OFF'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.scanButton,
                isScanning &&
                  styles.scanButtonActive,
              ]}
              onPress={scanDevices}
            >
              <Text
                style={
                  styles.scanNumber
                }
              >
                01
              </Text>

              <Text
                style={
                  styles.scanText
                }
              >
                {isScanning
                  ? 'Scanning...'
                  : 'Scan devices'}
              </Text>

              <Text
                style={
                  styles.scanArrow
                }
              >
                →
              </Text>
            </TouchableOpacity>

            <View
              style={
                styles.resultsHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.resultsEyebrow
                  }
                >
                  NEARBY DEVICES
                </Text>

                <Text
                  style={
                    styles.resultsTitle
                  }
                >
                  {isScanning
                    ? 'Searching...'
                    : devices.length > 0
                      ? `${devices.length} device${
                          devices.length === 1
                            ? ''
                            : 's'
                        } found`
                      : 'Devices will appear here'}
                </Text>
              </View>

              <Text
                style={
                  styles.resultsCount
                }
              >
                {String(
                  devices.length
                ).padStart(2, '0')}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View
            style={styles.emptyState}
          >
            <Text
              style={
                styles.emptyNumber
              }
            >
              00
            </Text>

            <View
              style={
                styles.emptyContent
              }
            >
              <Text
                style={
                  styles.emptyTitle
                }
              >
                {isScanning
                  ? 'Looking for BLE devices'
                  : 'No devices yet'}
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                {isScanning
                  ? 'Keep the Bluetooth device nearby while scanning.'
                  : 'Press Scan devices to start searching.'}
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          <View
            style={styles.footer}
          >
            <Text
              style={
                styles.footerText
              }
            >
              BLE / READ / WRITE /
              CONNECT
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        COLORS.background,
    },

    page: {
      backgroundColor:
        COLORS.background,
      paddingBottom: 45,
      minHeight: '100%',
    },

    activityPage: {
      backgroundColor:
        COLORS.background,
      paddingBottom: 50,
      minHeight: '100%',
    },

    topDecoration: {
      position: 'absolute',
      top: -90,
      left: -70,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: '#EF6D67',
    },

    header: {
      paddingTop: 18,
      paddingHorizontal: 27,
      paddingBottom: 26,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent:
        'space-between',
    },

    logo: {
      color: COLORS.text,
      fontSize: 29,
      fontWeight: '900',
      letterSpacing: -0.8,
    },

    headerSubtitle: {
      color: '#605D58',
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 3,
      marginTop: 6,
    },

    headerAccent: {
      color: COLORS.coral,
    },

    menuButton: {
      width: 44,
      height: 44,
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 5,
    },

    menuLine: {
      width: 25,
      height: 2,
      backgroundColor:
        COLORS.text,
    },

    backButton: {
      width: 45,
      height: 45,
      borderWidth: 1,
      borderColor: COLORS.text,
      alignItems: 'center',
      justifyContent: 'center',
    },

    backButtonText: {
      color: COLORS.text,
      fontSize: 27,
      lineHeight: 30,
    },

    heroCard: {
      marginHorizontal: 27,
      height: 360,
      backgroundColor:
        COLORS.paper,
      paddingHorizontal: 28,
      paddingTop: 69,
      overflow: 'hidden',
      shadowColor: '#625C50',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 7,
      },
      elevation: 5,
    },

    heroCircleLarge: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor:
        COLORS.coral,
      right: -92,
      top: -60,
    },

    heroCircleOutline: {
      position: 'absolute',
      width: 175,
      height: 175,
      borderRadius: 88,
      borderWidth: 1,
      borderColor: COLORS.coral,
      right: -62,
      top: 126,
    },

    heroEyebrow: {
      color: COLORS.text,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 3,
    },

    heroTitle: {
      color: COLORS.text,
      fontSize: 43,
      fontWeight: '400',
      letterSpacing: -2,
      marginTop: 21,
      lineHeight: 47,
    },

    heroTitleAccent: {
      color: COLORS.coral,
      fontSize: 43,
      fontWeight: '900',
      letterSpacing: -2.5,
      lineHeight: 47,
    },

    heroDescription: {
      color: COLORS.muted,
      fontSize: 18,
      lineHeight: 27,
      marginTop: 23,
    },

    heroNumber: {
      position: 'absolute',
      right: 26,
      bottom: -12,
      color: '#EEE8DE',
      fontSize: 103,
      fontWeight: '300',
      letterSpacing: -9,
    },

    heroArrow: {
      position: 'absolute',
      right: 29,
      bottom: 28,
      color: COLORS.coral,
      fontSize: 43,
      fontWeight: '300',
    },

    sectionIntro: {
      flexDirection: 'row',
      paddingHorizontal: 27,
      paddingTop: 34,
      paddingBottom: 31,
    },

    sectionNumber: {
      color: COLORS.coral,
      fontSize: 17,
      fontWeight: '900',
      marginRight: 31,
      marginTop: 3,
    },

    sectionText: {
      flex: 1,
    },

    sectionTitle: {
      color: COLORS.text,
      fontSize: 29,
      lineHeight: 31,
      fontWeight: '900',
      letterSpacing: -1,
    },

    sectionDescription: {
      color: COLORS.muted,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 19,
    },

    bluetoothStatus: {
      marginHorizontal: 27,
      minHeight: 82,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: COLORS.line,
      flexDirection: 'row',
      alignItems: 'center',
    },

    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        COLORS.green,
      marginRight: 15,
    },

    statusDotOff: {
      backgroundColor:
        COLORS.coral,
    },

    statusContent: {
      flex: 1,
    },

    statusTitle: {
      color: COLORS.text,
      fontSize: 17,
      fontWeight: '900',
    },

    statusDescription: {
      color: '#898278',
      fontSize: 13,
      marginTop: 5,
    },

    readyLabel: {
      color: COLORS.green,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 2,
    },

    notReadyLabel: {
      color: COLORS.coral,
    },

    scanButton: {
      marginHorizontal: 27,
      marginTop: 20,
      height: 67,
      backgroundColor:
        COLORS.coral,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 19,
    },

    scanButtonActive: {
      opacity: 0.78,
    },

    scanNumber: {
      color: '#FFD0C8',
      fontSize: 16,
      marginRight: 18,
    },

    scanText: {
      flex: 1,
      color: COLORS.white,
      fontSize: 21,
      fontWeight: '900',
    },

    scanArrow: {
      color: COLORS.white,
      fontSize: 34,
      fontWeight: '300',
    },

    resultsHeader: {
      marginHorizontal: 27,
      marginTop: 38,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderColor: COLORS.line,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'flex-end',
    },

    resultsEyebrow: {
      color: COLORS.coral,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2.4,
    },

    resultsTitle: {
      color: COLORS.text,
      fontSize: 17,
      fontWeight: '900',
      marginTop: 6,
    },

    resultsCount: {
      color: '#C9C0AF',
      fontSize: 32,
      fontWeight: '300',
    },

    deviceRow: {
      marginHorizontal: 27,
      minHeight: 105,
      borderBottomWidth: 1,
      borderColor: COLORS.line,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },

    deviceDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor:
        COLORS.coral,
      marginRight: 16,
    },

    deviceInfo: {
      flex: 1,
      paddingRight: 12,
    },

    deviceName: {
      color: COLORS.text,
      fontSize: 15,
      fontWeight: '900',
    },

    deviceId: {
      color: '#837C72',
      fontSize: 9,
      marginTop: 5,
    },

    deviceDetail: {
      color: '#837C72',
      fontSize: 9,
      marginTop: 4,
      lineHeight: 13,
    },

    deviceStatus: {
      color: COLORS.coral,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.2,
    },

    emptyState: {
      marginHorizontal: 27,
      minHeight: 105,
      borderBottomWidth: 1,
      borderColor: COLORS.line,
      flexDirection: 'row',
      alignItems: 'center',
    },

    emptyNumber: {
      color: '#D2C9B8',
      fontSize: 29,
      fontWeight: '300',
      marginRight: 22,
    },

    emptyContent: {
      flex: 1,
    },

    emptyTitle: {
      color: COLORS.text,
      fontSize: 15,
      fontWeight: '900',
    },

    emptyText: {
      color: '#837C72',
      fontSize: 11,
      lineHeight: 17,
      marginTop: 5,
    },

    footer: {
      paddingTop: 32,
      paddingHorizontal: 27,
    },

    footerText: {
      color: '#9E9586',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 2,
    },

    activityHero: {
      marginHorizontal: 27,
      backgroundColor:
        COLORS.paper,
      minHeight: 285,
      paddingHorizontal: 28,
      paddingTop: 55,
      paddingBottom: 30,
      overflow: 'hidden',
      elevation: 4,
    },

    activityHeroCircle: {
      position: 'absolute',
      width: 190,
      height: 190,
      borderRadius: 95,
      backgroundColor:
        COLORS.coral,
      right: -85,
      top: -70,
    },

    activityHeroTitle: {
      color: COLORS.text,
      fontSize: 42,
      fontWeight: '400',
      letterSpacing: -2,
      marginTop: 20,
      lineHeight: 45,
    },

    activityHeroAccent: {
      color: COLORS.coral,
      fontSize: 42,
      fontWeight: '900',
      letterSpacing: -2,
      lineHeight: 45,
    },

    activityHeroDescription: {
      color: COLORS.muted,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 20,
      width: '76%',
    },

    activityHeroNumber: {
      position: 'absolute',
      right: 25,
      bottom: -12,
      color: '#EEE8DE',
      fontSize: 100,
      fontWeight: '300',
    },

    connectedStatus: {
      marginHorizontal: 27,
      minHeight: 82,
      borderBottomWidth: 1,
      borderColor: COLORS.line,
      flexDirection: 'row',
      alignItems: 'center',
    },

    activitySection: {
      marginHorizontal: 27,
      paddingTop: 30,
      paddingBottom: 10,
    },

    activityHeading: {
      flexDirection: 'row',
      marginBottom: 22,
    },

    activityTitle: {
      color: COLORS.text,
      fontSize: 25,
      lineHeight: 29,
      fontWeight: '900',
      letterSpacing: -0.8,
    },

    activityDescription: {
      color: COLORS.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
    },

    inputLabel: {
      color: COLORS.coral,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2,
      marginBottom: 8,
      marginTop: 5,
    },

    input: {
      height: 57,
      borderBottomWidth: 1,
      borderColor: COLORS.text,
      color: COLORS.text,
      backgroundColor:
        COLORS.paper,
      paddingHorizontal: 15,
      fontSize: 16,
      marginBottom: 20,
    },

    primaryButton: {
      height: 67,
      backgroundColor:
        COLORS.coral,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 19,
      marginTop: 5,
    },

    primaryButtonNumber: {
      color: '#FFD0C8',
      fontSize: 16,
      marginRight: 18,
    },

    primaryButtonText: {
      flex: 1,
      color: COLORS.white,
      fontSize: 20,
      fontWeight: '900',
    },

    primaryButtonArrow: {
      color: COLORS.white,
      fontSize: 34,
    },

    outlineButton: {
      height: 65,
      borderWidth: 1,
      borderColor: COLORS.text,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 19,
    },

    outlineButtonNumber: {
      color: COLORS.coral,
      fontSize: 16,
      marginRight: 18,
    },

    outlineButtonText: {
      flex: 1,
      color: COLORS.text,
      fontSize: 19,
      fontWeight: '900',
    },

    outlineButtonArrow: {
      color: COLORS.coral,
      fontSize: 32,
    },

    darkButton: {
      height: 67,
      backgroundColor:
        COLORS.text,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 19,
    },

    darkButtonNumber: {
      color: '#8C867B',
      fontSize: 16,
      marginRight: 18,
    },

    darkButtonText: {
      flex: 1,
      color: COLORS.white,
      fontSize: 20,
      fontWeight: '900',
    },

    darkButtonArrow: {
      color: COLORS.coral,
      fontSize: 34,
    },

    valueBox: {
      backgroundColor:
        COLORS.paper,
      padding: 18,
      marginTop: 15,
      borderLeftWidth: 4,
      borderLeftColor:
        COLORS.green,
    },

    valueLabel: {
      color: COLORS.green,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 2,
    },

    valueText: {
      color: COLORS.text,
      fontSize: 18,
      fontWeight: '800',
      marginTop: 8,
    },

    gradeCard: {
      minHeight: 175,
      backgroundColor:
        COLORS.paper,
      marginTop: 18,
      padding: 25,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: 5,
      borderTopColor:
        COLORS.coral,
    },

    gradeLabel: {
      color: COLORS.coral,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 2.5,
    },

    gradeValue: {
      color: COLORS.text,
      fontSize: 55,
      fontWeight: '900',
      marginTop: 8,
      textAlign: 'center',
    },

    gradeHint: {
      color: COLORS.muted,
      fontSize: 10,
      marginTop: 7,
      textAlign: 'center',
    },

    disconnectButton: {
      marginHorizontal: 27,
      height: 58,
      marginTop: 25,
      borderWidth: 1,
      borderColor: COLORS.line,
      alignItems: 'center',
      justifyContent: 'center',
    },

    disconnectText: {
      color: COLORS.muted,
      fontSize: 13,
      fontWeight: '800',
    },
  });