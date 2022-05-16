import React, { useEffect, useState } from 'react';
import { Text, View, TouchableOpacity } from 'react-native';
import { ethers } from 'ethers';

const bip39 = require('bip39')
const bitcoin = require('bitcoinjs-lib');

const component = () => {
  const [userBTC, setUserBTC] = useState(null);
  const [txBTC, setTxBTC] = useState(null);
  const [hashBTC, setHashBTC] = useState(null);

  const initUser = async ()=>{
    const mnemonic = '';
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    let node = bitcoin.bip32.fromSeed( seed )
    
    let user = {};
    const child3 = node.derivePath("m/84'/0'/0'/0/0");
    user.keypair = child3;
    user.privkey = child3.privateKey;
    user.pubkey = child3.publicKey;

    user.p2wpkh = bitcoin.payments.p2wpkh({ 
      pubkey: child3.publicKey,
      network: bitcoin.networks.bitcoin
    });
    user.address = user.p2wpkh.address;

    const body = {
      method: 'BTC.GetBalance',
      params: {addr: user.address},
    }
    const response = await (await fetch('https://app.xchainer.io/api/rpc', {method: 'POST', body: JSON.stringify(body)})).json()
    user.balance = response.result;
    // console.log(`______API xchainer balance  `, response.result )

    const body2 = {
      method: 'BTC.GetUnspentTxs',
      params: {addr: user.address},
    }
    const response2 = await (await fetch('https://app.xchainer.io/api/rpc', {method: 'POST', body: JSON.stringify(body2)})).json()
    user.utxos = response2.result;
    // console.log(`______API xchainer GetUnspentTxs  `, response2.result )

    let amount = 0;
    user.utxos?.map(item=>{
      amount += item.amount;
      // console.log('___', item.amount)
    })
    user.amount = amount;

    const bodyFee = {
      method: 'BTC.GetRecommendedFees',
      params: {addr: user.address},
    }
    const gas = await (await fetch('https://app.xchainer.io/api/rpc', {method: 'POST', body: JSON.stringify(bodyFee)})).json()
    // console.log(`____gas___`, gas.result)
    user.gas = gas.result;

    console.log(`______SegWit user3______address=${user.address}  balance=${ user.balance }  utxos=${user.utxos?.length}   amount=${amount}  `)
    setUserBTC( user );
  }

  useEffect(()=>{
    initUser();
  },[]);

  const sendTx = async ()=>{
    var tx = new bitcoin.TransactionBuilder(bitcoin.networks.bitcoin);
    var total = 0;
    
    const utxos = userBTC.utxos;
    utxos.map(item=>{
      total += Number(item.amount);
      const output = userBTC.p2wpkh.output;
      tx.addInput(item.txid, item.vout, null, output)
    })
    
    const gas = userBTC.gas;
    const inputCount = utxos.length;
    const outputCount = 2;
    const feeMulti = 1;
    let fee = 0;

    const transactionSize = inputCount * 146 + outputCount * 34 + 10 - inputCount;
    let feePrice = Number(gas.halfHourFee) * Number(feeMulti);
    // fee = ethers.utils.formatUnits( String( transactionSize * feePrice ), 8);
    fee = (transactionSize * feePrice) / 100000000;
    console.log('__send3__')
    const amountToSend = 0.00001;
    const send = total-fee-amountToSend;
    
    const receiverAmount = Math.floor( amountToSend * 100000000 );
    const senderAmount = Math.floor( send * 100000000 );
    tx.addOutput(userBTC.address, receiverAmount )   
    tx.addOutput(userBTC.address, senderAmount )  
    
    utxos.map((item, id)=>{
      tx.sign(id, userBTC.keypair, null, null, Math.floor(item.amount * 100000000) )
    })  
    
    setTxBTC(tx);
    const hex = tx.build().toHex();

    const body = {
      method: 'BTC.SendRawTx',
      params: {tx: String(hex)},
    }
    const response = await (await fetch('https://app.xchainer.io/api/rpc', {method: 'POST', body: JSON.stringify(body)})).json()
    setHashBTC('txid = ' + response.result);
  }

  return (<View>
    <Text>BTC Container</Text>
    { (!userBTC ? <Text>Loading data</Text> : 
       !txBTC ? <TouchableOpacity onPress={sendTx} style={{padding:10, backgroundColor:'#99FFFF'}}><Text>Send TX</Text></TouchableOpacity> : 
       !hashBTC ? <Text>Wait</Text> : <Text>{hashBTC}</Text>)}
  </View>)
};

export default component;

