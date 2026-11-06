const MODELS = Object.freeze([
 {id:'qwen3-0.6b',name:'Qwen3 0.6B',kind:'llm',format:'gguf',file:'Qwen3-0.6B-Q8_0.gguf',bytes:639446688,sha256:'9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',url:'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',minRamGiB:4,license:'Apache-2.0',note:'Small chat model for limited memory. Tool planning can be unreliable; approve actions carefully.'},
 {id:'qwen3-1.7b',name:'Qwen3 1.7B',kind:'llm',format:'gguf',file:'Qwen3-1.7B-Q8_0.gguf',bytes:1834426016,sha256:'061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a',url:'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',minRamGiB:8,license:'Apache-2.0',note:'Balanced local chat. Test tool quality against your own tasks.'},
 {id:'qwen3-4b',name:'Qwen3 4B',kind:'llm',format:'gguf',file:'Qwen3-4B-Q4_K_M.gguf',bytes:2497280256,sha256:'7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',url:'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',minRamGiB:16,license:'Apache-2.0',note:'Higher capacity; uses more memory and may run more slowly.'}
]);
module.exports={MODELS};
