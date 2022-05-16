import { StyleSheet, View } from 'react-native';

import BTCComponent from './src/btc-repro/BTC'

export default function App() {
  return (
    <View style={styles.container}>
      <BTCComponent />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
