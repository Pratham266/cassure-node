import axios from 'axios';

export const startCron = () => {
    setInterval(() => {
        try {
            axios.get('https://bankstatemet-praser.onrender.com/');
            axios.get('https://cassure-node.onrender.com/');
            console.log('Pinged server successfully');
        } catch (error) {
            // ignore
        }
    }, 600000); // 10 minutes
}