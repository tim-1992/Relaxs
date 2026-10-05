// Original models generated for Relaxs. Binary scripts load on demand, including file://.
export const TRIPO_ASSETS=Object.freeze({
  monster:{name:'薄荷小怪兽',role:'敲击角色',file:'monster',model:'P1',task:'14122e63-361c-41c7-af3e-d46a86bc8430',frontYaw:-Math.PI/2},
  athlete:{name:'球场旅人',role:'篮球人物',file:'athlete',model:'H 3.1',task:'7048d89e-1352-46ee-94e1-76cd0af23900'},
  player:{name:'Tripo 3号球手',role:'绑骨篮球人物',file:'player',model:'H 3.1 + Auto Rig',task:'c87b7715-40e2-491a-9940-859869e6a91f',generationTask:'7048d89e-1352-46ee-94e1-76cd0af23900'},
  motorcycle:{name:'疾风摩托',role:'可操控赛车',file:'motorcycle',model:'H 3.1',task:'7885bf4e-3a36-4067-9ea6-831322094b5d'},
  turtle:{name:'绿海龟',role:'海底探索目标',file:'turtle',model:'H 3.1',task:'879af081-3ed9-4b60-9300-af8df4c359d9'},
  coral:{name:'浅海珊瑚',role:'海底地形',file:'coral',model:'H 3.1',task:'abde36af-92a8-444a-98f5-6122adef2925'},
  manta:{name:'礁蝠鲼',role:'礁缘滑翔生物',file:'manta',model:'H 3.1',task:'398f0a2d-c66f-4453-8d67-34fb8af307be'},
  dolphin:{name:'宽吻海豚',role:'海底探索目标',file:'dolphin',model:'H 3.1',task:'f815972b-1674-4954-97e3-db105519560a'},
  clownfish:{name:'小丑鱼',role:'海葵鱼群',file:'clownfish',model:'H 3.1',task:'427e4bae-d7ef-416a-b53d-09e04da98c11'},
  angelfish:{name:'皇帝神仙鱼',role:'珊瑚礁鱼群',file:'angelfish',model:'H 3.1',task:'9c370876-e1f0-46a3-91a1-f7dea0314388'},
  seafan:{name:'红海扇',role:'礁石花园',file:'seafan',model:'H 3.1',task:'9b7f7d3c-1b0b-451c-9aec-fd260b3cf188'},
  tablecoral:{name:'桌形鹿角珊瑚',role:'层叠礁台',file:'tablecoral',model:'H 3.1',task:'b26bc06e-8a9a-4e52-8450-66b18360a861'},
  anemone:{name:'锦绣海葵',role:'近景珊瑚花园',file:'anemone',model:'H 3.1',task:'f9da932b-9edb-4112-8f78-1e974897d1d7'},
  sofa:{name:'亚麻沙发',role:'可破坏家具',file:'sofa',model:'H 3.1',task:'e6feec2f-48c0-4ee4-842b-a5f317ca88fa'},
  tv:{name:'薄屏电视',role:'可破坏电器',file:'tv',model:'H 3.1',task:'5c905077-ea5e-4bd6-8c3f-bafe2a00ebc1'},
  vase:{name:'陶瓷花瓶',role:'可击碎摆件',file:'vase',model:'H 3.1',task:'25d5407d-b27c-4135-b9e3-f6c0c97512a9'},
  car:{name:'银色跑车',role:'可压缩车辆',file:'car',model:'H 3.1',task:'450f1042-b1e9-4fde-8513-49752ebbab71'},
  orange:{name:'阳光甜橙',role:'可切开的水果',file:'orange',model:'H 3.1',task:'64814076-9471-4387-aca9-7a1212682ed1'},
  pine:{name:'林间松树',role:'公路沿途植被',file:'pine',model:'H 3.1',task:'f1b930d5-d5b1-4c13-8678-2a596746c2d2'},
  rider:{name:'Tripo 3号骑手',role:'绑骨骑行角色',file:'rider',model:'H 3.1 + Auto Rig',task:'49c2a527-e037-4b9a-aca4-c59603d02663',generationTask:'d15cd8fa-2160-4195-a441-7d0f3479b48c'},
});
const loading=new Map();
export function loadTripoAsset(id) {
  if(!TRIPO_ASSETS[id])return Promise.reject(new Error('未知模型'));
  if(loading.has(id))return loading.get(id);
  const info=TRIPO_ASSETS[id];
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL(`./src/tripo-data-${info.file}.js`,document.baseURI).href;
    script.async=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error('模型加载超时'));},20000);
    script.onload=()=>{
      clearTimeout(timer);script.remove();
      try{
        const encoded=globalThis.__RELAXS_TRIPO_DATA__?.[id];
        if(!encoded)throw new Error('模型数据不可用');
        const raw=atob(encoded),bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        delete globalThis.__RELAXS_TRIPO_DATA__[id];
        resolve({...info,buffer:bytes.buffer,name:`${info.name}.glb`,source:'Tripo'});
      }catch(error){reject(error);}
    };
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('模型未能读取'));};
    document.head.append(script);
  }).catch(error=>{loading.delete(id);throw error;});
  loading.set(id,promise);return promise;
}
