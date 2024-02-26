const {ethers} = require('ethers')
const { getDatabase, set, ref, get } = require('firebase/database')
const { initializeApp } = require('firebase/app') 
const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const ABI = require('./constants/ABI')
const app = express()
dotenv.config()

const { RPC_PROVIDER_URL, ADMIN_PRIVATE_KEY, CONTRACT_ID, DATABASE_URL } = process.env

const firebaseConfig = {
    //appId: 'paramak-senior-project-db',
    databaseURL: DATABASE_URL
}


// const ABI = [
//     'function balanceOf(address account) external view returns (uint256)',
//     'function transfer(address recipient, uint256 amount) external returns (bool)',
//     'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
//     'function tokenURI(uint256 tokenId) external view returns (string)',
//     'function safeMint(address to, string uri) external view returns ()'
// ]

const users = []

async function temp() {
    const provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL)
    const wallet = new ethers.Wallet(privateKey, provider)
    const contract = new ethers.Contract(CONTRACT_ID, ABI, wallet)
    const nftCount = await contract.balanceOf(wallet.address)
    for(var i = 0; i < nftCount; ++i) {
        const id = await contract.tokenOfOwnerByIndex(wallet.address, i)
        const uri = await contract.tokenURI(id)
        console.log(JSON.parse(decodeURIComponent(uri.split(' ')[1].slice(1, -1))))
    }
}

const firebaseApp = initializeApp(firebaseConfig, 'paramak-senior-project-db')
const db = getDatabase(firebaseApp)

app.use(cors())
app.use(express.json({
    type: 'application/json'
}))
app.use(express.urlencoded({extended: false}))
app.use('/static', express.static(path.join(__dirname, 'public')))


app.get('/token/:walletID', (req, res) => {
    
})

app.get('/', (req, res) => {
    res.status(200).send('Server is running normally.')
})
app.get('/term-of-use', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, 'views', 'term-of-use.html'))
})


app.get('/thaid-auth', (req, res) => {
    res.redirect(`https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/?response_type=code&client_id=${process.env.THAID_CLIENT_ID}&redirect_uri=${process.env.THAID_CALLBACK_ENDPOINT}&scope=pid&state=af0ifjsldkj`)
})

app.get('/thaid-redirect', async (req, res) => {
    const {code} = req.query
    const base64Encoded = btoa(process.env.THAID_CLIENT_ID + ':' + process.env.THAID_CLIENT_SECRET)
    try {
        const thaidRes = await fetch('https://imauth.bora.dopa.go.th/api/v2/oauth2/token/', {
            method: 'POST',
            headers: {
                'Content-type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${base64Encoded}`
            },
            body: new URLSearchParams({
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': process.env.THAID_CALLBACK_ENDPOINT
            })
        })
        const { pid, access_token, refresh_token } = await thaidRes.json() 
        const tokenString = jwt.sign({
            pid: pid,
            access_token: access_token,
            refresh_token: refresh_token
        }, process.env.JWT_SECRET_KEY)
        res.redirect(`/#/record?token=${tokenString}`)
    } catch (error) {
        console.log(error)
        res.send('<h1>Failed to authenticate.<h1>')
    }
})

app.get('/patient_data', async (req, res) => {
    const tokenString = req.query.token
    const token = jwt.verify(tokenString, process.env.JWT_SECRET_KEY)
    const {pid} = token
    const snapshot = await get(ref(db, `patients/${pid}`))
    const patient = snapshot.val()
    if(patient === null) {
        return res.status(400).json({
            status: 'failed',
            message: 'Patient ID not found.'
        })
    }
    const provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL)
    const wallet = new ethers.Wallet(patient['walletPrivateKey'], provider)
    const contract = new ethers.Contract(CONTRACT_ID, ABI, wallet)
    const nftCount = await contract.balanceOf(wallet.address)
    const data = []
    for(var i = 0; i < nftCount; ++i) {
        const id = await contract.tokenOfOwnerByIndex(wallet.address, i)
        const uri = await contract.tokenURI(id)
        data.push(JSON.parse(uri))
    }
    console.log(data)
    return res.status(200).json({
        status: 'success',
        data: data
    })
})

app.post('/mint', async (req, res) => {
    try {
        const snapshot = await get(ref(db, `patients/${req.body.id}`))
        var patient = snapshot.val()
        if(patient === null) {
            const wallet = ethers.Wallet.createRandom()
            patient = await set(ref(db, `patients/${req.body.id}`), {
                walletAddress: wallet.address,
                walletPrivateKey: wallet.privateKey
            })
            patient = {
                'walletAddress': wallet.address,
                'walletPrivateKey': wallet.privateKey
            }
        }
        const provider = new ethers.JsonRpcProvider(RPC_PROVIDER_URL)
        const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider)
        const contract = new ethers.Contract(CONTRACT_ID, ABI, wallet)
        const date = new Date()
        await contract.safeMint(patient['walletAddress'], JSON.stringify({
            date: date.toLocaleDateString() + " " + date.toLocaleTimeString(),
            ...req.body.data
        }))
        res.status(200).json({
            status: 'success'
        })
    } catch (error) {
        res.status(400).json({
            status: 'failed',
            error: error
        })
    }
})

app.listen(process.env.PORT, () => console.log('App is running on PORT:' + process.env.PORT))