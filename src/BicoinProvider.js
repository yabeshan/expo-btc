import { BaseProvider } from './baseProvider'
import { ethers } from "ethers"

const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');

export class BitcoinProvider extends BaseProvider {
  constructor(network, account, asset) {    
    super(network, account)
    this.network = network
    this.withoutFee = false
    this.isLegacy = (asset.id.indexOf('legacy')>=0)
    this.walletStore = asset.walletStore
    this.asset = asset
    
    this.isTestnet = (network.indexOf('api.blockcypher.com')>0);
    this.networkType = (this.isTestnet) ? bitcoin.networks.testnet : bitcoin.networks.bitcoin ;
    // console.log(`---testnet---`, this.isTestnet, this.networkType )
    this.updateAccount(account);
  }

  updateAccount(account) {
    const seed = bip39.mnemonicToSeedSync(this.walletStore.mnemonic);
    let node = bitcoin.bip32.fromSeed( seed, this.networkType )
    
    if (this.isLegacy) {
      account.keypairLegacy = node.derivePath("m/0'/0/0");
      if (this.walletStore.selectedAccountIndex>0) {
        account.keypairLegacy = account.keypairLegacy.derive(this.walletStore.selectedAccountIndex);
      }
      if (!account.BTCLegacy) account.BTCLegacy = {};
      account.BTCLegacy.address = bitcoin.payments.p2pkh({ 
        pubkey: account.keypairLegacy.publicKey,
        network: this.networkType
      }).address; // need update for testnet
      // console.log(`----legacy---`, account.BTCLegacy.address)
    } else {
      account.keypair = node.derivePath(`m/84'/0'/${this.walletStore.selectedAccountIndex}'/0/0`);
      account.p2wpkh = bitcoin.payments.p2wpkh({ 
        pubkey: account.keypair.publicKey,
        network: this.networkType
      });
      account.addressBTC = account.p2wpkh.address;// need update for testnet
      // console.log(`----segwit---`, account.addressBTC )
    }
  }

  getCorrectAddress = ()=>(this.isLegacy) ? this.account.BTCLegacy.address : this.account.addressBTC;

  async getBalance() {
    try {
      const correctAddress = this.getCorrectAddress();

      if (this.isTestnet) {
        // const token = '9513e1484c254b22a0a140022cf209a2';
        const token = '3a6bed2fb7eb4c23a03bc6c336e27df3';
        const res = (await (await fetch(`${this.network}/addrs/${correctAddress}/balance?token=${token}`)).json())
        const bal = ethers.utils.formatUnits( String(res.final_balance), 8);
        // console.log(`___bal___`, bal)
        return bal;
      }

      const body = {
        method: 'BTC.GetBalance',
        // headers: { 'Content-Type': 'application/json' },
        params: {addr: correctAddress},
      }
      const response = await (await fetch(this.network, {method: 'POST', body: JSON.stringify(body)})).json()
      const balance = response.result
      return balance
    } catch (err) {
      console.log(`--BTC---`, err)
      return '-1'
    }
  }

  async getRecommendedFees(address) {
    try {
      if (this.isTestnet) {
        return {"halfHourFee":2,"hourFee":2};
      }

      const bodyFee = {
        method: 'BTC.GetRecommendedFees',
        params: {addr: address},
      }
      const gas = await (await fetch(this.network, {method: 'POST', body: JSON.stringify(bodyFee)})).json()
      // console.log(`____gas___`, gas.result)
      return gas.result;
    } catch (err) {
      console.log(err)
      return 1
    }
  }

  async getUTXOs (address) {
    try {      
      // const sochainAPI = (this.isTestnet) ? 'BTCTEST' : 'BTC' ;
      // const sochainUtxos = (await (await fetch(`https://sochain.com/api/v2/get_tx_unspent/${sochainAPI}/${address}`)).json())
      // console.log(`_______sochain  utxos______`, address, sochainUtxos.data.txs)

      if (this.isTestnet) {
        // const token = '9513e1484c254b22a0a140022cf209a2';
        const token = '3a6bed2fb7eb4c23a03bc6c336e27df3';
        // const link = `https://api.blockcypher.com/v1/btc/main/addrs/${address}?unspentOnly=true&token=${token}`
        const link = `${this.network}/addrs/${address}?unspentOnly=true&token=${token}`;
        const utxosTest = (await (await fetch( link )).json())
        // console.log(`___blockcypher utxos_____`, utxosTest.txrefs) 
        const allTest = (!utxosTest.txrefs) ? [] : utxosTest.txrefs.map( item => {
          return {txid:item.tx_hash, vout:item.tx_output_n, amount: ethers.utils.formatUnits( String(item.value), 8)};
        })
        return allTest;
      }

      const bodyFee = {
        method: 'BTC.GetUnspentTxs',
        params: {addr: address},
      }
      const response = await fetch(this.network, {method: 'POST', body: JSON.stringify(bodyFee)});
      const utxos = await response.json()
      // console.log(`_______utxos______`, utxos.result )
      const all = (!utxos.result) ? [] : utxos.result.map( item => {
        return {txid: item.txid, vout: item.vout, amount: item.amount}
      })
      return all;
    } catch (err) {
      console.log(err)
      return []
    }
    
  }

  async getAvailableBalance() {
    // console.log(`----getAvailableBalance 1----`)
    const correctAddress = this.getCorrectAddress();
    const balance = await this.getBalance();
    // console.log(`----getAvailableBalance 2----`)
    const utxos = await this.getUTXOs(correctAddress);
    let available = 0;
    // console.log(`----getAvailableBalance 3----`, utxos)
    utxos.map( item => {
      available += Number(item.amount);
    })
    console.log(`_______utxos_____`, available, utxos.length);
    // console.log(`----getAvailableBalance 4----`)

    const gas = await this.getRecommendedFees(correctAddress);
    const inputCount = utxos.length;
    const outputCount = 2;
    const feeMulti = 1;
    let fee = 0;
    // if (inputCount>0 && available>0) {
      const transactionSize = inputCount * 146 + outputCount * 34 + 10 - inputCount;
      let feePrice = Number(gas.halfHourFee) * Number(feeMulti);
      fee = ethers.utils.formatUnits( String( transactionSize * feePrice ), 8);
      // console.log(transactionSize, feePrice, fee, gas.halfHourFee , Number(feeMulti) );
    // }
    console.log(`----getAvailableBalance finish----`, fee)
    return {balance, fee, available}
  }

  async prepareTransaction(recieverAddress, amountToSend, feeMulti = 1) {
    const correctAddress = this.getCorrectAddress();
    const utxos = await this.getUTXOs(correctAddress);
    let totalAmountAvailable = 0
    utxos.map( item => {
      totalAmountAvailable += Number(item.amount);
    })
    const gas = await this.getRecommendedFees(correctAddress);
    const inputCount = utxos.length;
    const outputCount = 2
    let fee = 0
    const satoshiToSend = amountToSend * 100000000;
    const transactionSize = inputCount * 146 + outputCount * 34 + 10 - inputCount
    const feePrice = gas.halfHourFee * feeMulti
    fee = transactionSize * feePrice;

    return {
      fee,
      transactionSize,
      feePrice,
      utxos,
      satoshiToSend,
      correctAddress,
      totalAmountAvailable
    }
  }

  async sendHex(hex) {
    if (this.isTestnet) {
      const res = (await (await fetch(`${this.network}/txs/push`, {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify( { tx: hex } )
        })).json())
      console.log(`______send TX res_____ `, res.tx?.hash, res )
      return {txid:res.tx?.hash}
    }

    const body = {
      method: 'BTC.SendRawTx',
      params: {tx: String(hex)},
    }
    const response = await (await fetch('https://app.xchainer.io/api/rpc', {method: 'POST', body: JSON.stringify(body)})).json()
    console.log(`______API send TX  `, response.result, response )
    return {txid:response.result}
  }

  async send(recieverAddress, amountToSend, gasPrice, gas) {
    const correctAddress = this.getCorrectAddress();
    console.log(`______send 1_____ `, this.networkType);
    var tx = new bitcoin.TransactionBuilder(this.networkType);
    var total = 0;
    const utxos = await this.getUTXOs(correctAddress);
    
    utxos.map(item=>{
      // console.log(`____item__`, item)
      total += Number(item.amount);
      if (this.isLegacy) {
        // console.log(`_____output 1____` )
        tx.addInput(item.txid, item.vout)
      } else {
        const output = this.account.p2wpkh.output;
        // console.log(`_____output 3____`, this.user.p2wpkh.output , this.account.p2wpkh.output )
        // console.log(`_____output`, this.user.p2wpkh.output )
        tx.addInput(item.txid, item.vout, null, output)
      }
    })
    const fee = Math.floor(gasPrice * gas) / 100000000;
    const send = total-fee-amountToSend;
    const receiverAmount = Math.floor( amountToSend * 100000000 );
    const senderAmount = Math.floor( send * 100000000 );
    // console.log(`______send 2_____ `, send , total,fee,amountToSend);
    tx.addOutput(recieverAddress, receiverAmount )   
    tx.addOutput(correctAddress, senderAmount )  
    // console.log(`______send 3_____ `, receiverAmount, senderAmount, recieverAddress, correctAddress);
    utxos.map((item, id)=>{
      // console.log(`______send 4_____ `, correctAddress, this.account     );
      const keypair = (this.isLegacy) ? this.account.keypairLegacy : this.account.keypair
      tx.sign(id, keypair, null, null, Math.floor(item.amount * 100000000) )
    })  
    const hex = tx.build().toHex();
    const res = await this.sendHex(hex);
    
    return {
      id: (res && res.txid) ? res.txid : null,
      to: recieverAddress,
      from: correctAddress,
      amount: amountToSend,
      type: 'transfer'
    }
  };

  async getSendFee(toAddress, amount, multi) {
    const {fee, feePrice, transactionSize, totalAmountAvailable} = await this.prepareTransaction(toAddress, amount, multi);
    // console.log(`_____getSendFee 2______`, fee, feePrice, transactionSize)

    return {
      gas: transactionSize,
      gasPrice: feePrice,
      totalFee: fee / 100000000,
      gasPriceFormatted: feePrice,
      totalAmountAvailable: totalAmountAvailable
    };
  }

  async getTransactions() {
    try {
      const correctAddress = this.getCorrectAddress();
      if (this.isTestnet) {
        return [];
      }

      const body = {
        method: 'BTC.GetTxsByAddr',
        params: {addr: correctAddress.toLowerCase(),skip:0,limit:100},
      }

      const response = await (await fetch(this.network, {method: 'POST', body: JSON.stringify(body)})).json()
      // const resultMempool = []
      const bodyMemPool = {
        method: 'BTC.GetMemPoolTxsByAddr',
        params: {addr: correctAddress.toLowerCase()},
      }

      const responseMempool = await (await fetch(this.network, {method: 'POST', body: JSON.stringify(bodyMemPool)})).json()
      // console.log({responseMempool})

      const resultMempool = (!responseMempool.result) ? [] : responseMempool.result
      .map(item => {
        let amountTo = 0;
        const allTo = item.vin.map(val => {
          const add = val.voutObj.scriptPubKey.address;
          if (add === correctAddress.toLowerCase()) amountTo = val.voutObj.value;
          return add;
        } ); 

        let amountFrom = 0;
        const allFrom = item.vout.map(val => {
          const add = val.scriptPubKey.address;
          if (add === correctAddress.toLowerCase()) amountFrom = val.value;
          return add;
        } );
        return {
          id: item.txid,
          txHash: item.txid,
          createTime: item.time,
          explorer: `https://www.blockchain.com/btc/tx/${item.txid}`,
          to: allFrom,
          from: allTo,
          amount: (amountFrom!=0) ? amountFrom : amountTo,
          pending: true,
          success: true,
          type: 'transfer'
        }
      })

      const result = (!response.result) ? [] : response.result
      .map(item => {
        let amountTo = 0;
        const allTo = item.vin.map(val => {
          const add = val.voutObj.scriptPubKey.address;
          if (add === correctAddress.toLowerCase()) amountTo += val.voutObj.value;
          return add;
        } ); 

        let amountFrom = 0;
        const allFrom = item.vout.map(val => {
          const add = val.scriptPubKey.address;
          if (add === correctAddress.toLowerCase()) amountFrom += val.value;
          return add;
        } ); 

        const getAmount = (amountFrom, amountTo)=>{
          if (amountFrom != 0 && amountTo == 0) {
            return amountFrom;
          }
          if (amountFrom == 0 && amountTo != 0) {
            return amountTo;
          }
          
          const from = ethers.utils.parseUnits(amountFrom.toString());
          const to = ethers.utils.parseUnits(amountTo.toString());
          const diff = ethers.utils.formatUnits(from - to);
          return Math.abs(diff);
        }

        return {
          id: item.txid,
          txHash: item.txid,
          createTime: item.time,
          explorer: `https://www.blockchain.com/btc/tx/${item.txid}`,
          to: allFrom,
          from: allTo,
          amount: getAmount(amountFrom, amountTo),
          success: true,
          type: 'transfer'
        }
      })

      return [...resultMempool, ...result]
    } catch (err) {
      console.log(err)
      return []
    }
  }
}