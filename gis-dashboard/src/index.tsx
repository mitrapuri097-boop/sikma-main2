// src/mockup.tsx - Updated dengan mitigation support dan risk refresh handler
import { useState, useEffect } from 'react';
import IndonesiaMap from './components/maps/maps';
import Filter from './components/filters/filter';
import Statistic from './components/statistic/statistic';
import DetailedStatistic from './components/detailedstatistic/DetailedStatistic';
import TableDataView from './components/tabledataviews/tableDataView';
import ChartTabsComponent from './components/charttabs/chartTabs';
import FileManager from './components/filemanager/fileManager';
import ShpManagement from './components/shpmanagement/shpmanagement';
import DataTable from './components/datatable/datatable';
import { API_URL } from './api';

function DetailKerawananPhotos({ detailView }: any) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      if (!detailView) return;
      
      try {
        setLoading(true);
        
        // PENTING: Tentukan level yang benar untuk dikirim ke backend
        // detailView.level adalah level DETAIL (provinsi, kabupaten, kecamatan, kelurahan)
        // detailView.analysis_level adalah level ASAL (Indonesia, Provinsi, Kabupaten/Kota, dll)
        
        let levelParam = detailView.level; // Default: gunakan level detail
        let locationParam = detailView.selectedArea; // Default: gunakan area yang diklik
        
        // Jika berasal dari level Indonesia, dan user klik provinsi
        if (detailView.analysis_level === 'Indonesia' && detailView.level === 'provinsi') {
          // Level adalah provinsi, location adalah nama provinsi yang diklik
          levelParam = 'provinsi';
          locationParam = detailView.selectedArea;
        }
        
        console.log('🔍 Fetching photos with params:', {
          disaster_type: detailView.disaster_type,
          level: levelParam,
          location_name: locationParam,
          originalLevel: detailView.level,
          analysisLevel: detailView.analysis_level,
          selectedArea: detailView.selectedArea
        });
        
        const url = new URL(`${API_URL}/api/kejadian-photos-by-location`);
        url.searchParams.append('disaster_type', detailView.disaster_type);
        url.searchParams.append('level', levelParam);
        url.searchParams.append('location_name', locationParam);
        
        console.log('📡 Fetching from URL:', url.toString());
        
        const response = await fetch(url.toString());
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Failed to fetch photos:', response.status, errorText);
          throw new Error(`Failed to fetch photos: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Received photos data:', data);
        
        if (data.photos && Array.isArray(data.photos)) {
          console.log(`📷 Setting ${data.photos.length} photos`);
          setPhotos(data.photos);
        } else {
          console.warn('⚠️ No photos array in response');
          setPhotos([]);
        }
      } catch (error) {
        console.error('❌ Error fetching photos:', error);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPhotos();
  }, [detailView]);

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const handleCloseModal = () => {
    setSelectedPhotoIndex(null);
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && selectedPhotoIndex > 0) {
      setSelectedPhotoIndex(selectedPhotoIndex - 1);
    }
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedPhotoIndex !== null && selectedPhotoIndex < photos.length - 1) {
      setSelectedPhotoIndex(selectedPhotoIndex + 1);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center p-4">
          <p className="text-gray-600">Memuat foto...</p>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center p-4">
          <p className="text-gray-600">Tidak ada foto tersedia untuk lokasi ini</p>
          <p className="text-xs text-gray-400 mt-2">
            Level: {detailView?.level} | Area: {detailView?.selectedArea}
          </p>
        </div>
      </div>
    );
  }

  const defaultImage = 'https://via.placeholder.com/300x200?text=No+Image';
  const photoUrls = photos.map(path => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    } else if (path.startsWith('/uploads/')) {
      return `${API_URL}${path}`;
    } else {
      return `${API_URL}/uploads/${path}`;
    }
  });
  
  console.log('🖼️ Photo URLs:', photoUrls);
  
  const visiblePhotos = photoUrls.slice(0, 4);
  const extraPhotosCount = photoUrls.length - 4;

  return (
    <div className="h-full p-4 bg-white rounded-lg overflow-auto">
      <div className="photos-container" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 175px)',
        gap: '0.5rem'
      }}>
        {visiblePhotos.map((photo, index) => (
          <div key={index} className="photo-wrapper" style={{
            position: 'relative',
            width: '175px',
            height: '175px',
            overflow: 'hidden',
            borderRadius: '0.25rem',
            boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer'
          }}>
            <img
              src={photo}
              alt={`Foto ${index + 1}`}
              className="photo"
              onClick={() => handlePhotoClick(index)}
              onError={(e) => {
                console.error('Failed to load image:', photo);
                (e.target as HTMLImageElement).src = defaultImage;
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '0.25rem',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            />
            {index === 3 && extraPhotosCount > 0 && (
              <div 
                className="extra-photo-count"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePhotoClick(index);
                }}
                style={{
                  position: 'absolute',
                  top: '0.1rem',
                  left: '0.1rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  color: 'white',
                  fontSize: '3rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  zIndex: 10,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                +{extraPhotosCount}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Photo Modal - sama seperti sebelumnya, tidak perlu diubah */}
      {selectedPhotoIndex !== null && (
        <div 
          className="photo-modal-overlay"
          onClick={handleCloseModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            cursor: 'pointer'
          }}
        >
          <button
            className="modal-close-button"
            onClick={handleCloseModal}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              fontSize: '2rem',
              color: 'white',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              zIndex: 1001
            }}
          >
            ×
          </button>

          {selectedPhotoIndex > 0 && (
            <button
              className="modal-prev-button"
              onClick={handlePrevPhoto}
              style={{
                position: 'absolute',
                top: '50%',
                left: '1rem',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: 'none',
                color: 'white',
                padding: '1rem',
                cursor: 'pointer',
                zIndex: 1002,
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}

          <div 
            className="photo-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '80vw',
              maxHeight: '80vh',
              overflow: 'hidden',
              borderRadius: '0.5rem',
              backgroundColor: '#000',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
            }}
          >
            <img
              src={photoUrls[selectedPhotoIndex]}
              alt={`Foto ${selectedPhotoIndex + 1}`}
              className="photo-modal-image"
              style={{
                maxWidth: '600px',
                maxHeight: '400px',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = defaultImage;
              }}
            />

            <div 
              className="photo-modal-thumbnails"
              style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '1rem',
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: '#ccc #000'
              }}
            >
              {photoUrls.map((photo, index) => (
                <img
                  key={index}
                  src={photo}
                  alt={`Thumbnail ${index + 1}`}
                  className={`photo-thumbnail ${selectedPhotoIndex === index ? 'active' : ''}`}
                  onClick={() => setSelectedPhotoIndex(index)}
                  style={{
                    width: '80px',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    border: selectedPhotoIndex === index ? '2px solid #2563eb' : '2px solid transparent'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = defaultImage;
                  }}
                />
              ))}
            </div>
          </div>

          {selectedPhotoIndex < photoUrls.length - 1 && (
            <button
              className="modal-next-button"
              onClick={handleNextPhoto}
              style={{
                position: 'absolute',
                top: '50%',
                right: '1rem',
                transform: 'translateY(-50%)',
                background: 'rgba(0, 0, 0, 0.5)',
                border: 'none',
                color: 'white',
                padding: '1rem',
                cursor: 'pointer',
                zIndex: 1002,
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Mockup() {
  const [filterData, setFilterData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('Kerawanan');
  const [detailView, setDetailView] = useState<any>(null);
  
  
  // State untuk trigger refresh risk analysis
  const [riskRefreshTrigger, setRiskRefreshTrigger] = useState(0);
  
  // TAMBAHAN: State untuk map count
  const [mapCount, setMapCount] = useState<number>(1);

  // TAMBAHAN: State untuk selected year di YearStat
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // TAMBAHAN: Handler untuk year selection
  const handleYearSelect = (year: number) => {
    setSelectedYear(year);
  };

  const handleFilterChange = (newFilterData: any) => {
    console.log('Mockup received filter data:', newFilterData);
    if (newFilterData && newFilterData.locationType === 'Indonesia') {
      newFilterData.selectedValue = 'Indonesia';
    }
    setFilterData(newFilterData);
    setDetailView(null);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setDetailView(null);
  };

  const handleDetailView = (detailData: any) => {
    console.log('Entering detail view:', detailData);
    setDetailView(detailData);
  };

  const handleBackToMain = () => {
    setDetailView(null);
  };

  // Handle reset dari detail view
  const handleResetToMain = () => {
    console.log('Resetting to main view from filter reset');
    setDetailView(null);
    setFilterData(null);
    setActiveTab('Kerawanan');
  };

  // TAMBAHAN: Handle map count change
  const handleMapCountChange = (count: number) => {
    console.log('Map count changed to:', count);
    setMapCount(count);
  };

  // Handle risk analysis update dari TableDataView
  const handleRiskAnalysisUpdate = (shouldRefresh: boolean) => {
    if (shouldRefresh) {
      console.log('Mockup: Triggering risk analysis refresh...');
      
      // Increment trigger untuk force refresh map component
      setRiskRefreshTrigger(prev => prev + 1);
      
      // Jika sedang dalam mode Kerawanan dengan risk analysis, refresh filter data
      if (filterData && filterData.isRiskAnalysis && activeTab === 'Kerawanan') {
        console.log('Mockup: Refreshing current risk analysis filter...');
        
        // Create new filter object to trigger re-render
        const refreshedFilterData = {
          ...filterData,
          refreshTrigger: Date.now() // Add timestamp to force refresh
        };
        
        setTimeout(() => {
          setFilterData(refreshedFilterData);
        }, 500); // Small delay to allow backend to process
      }
    }
  };

  // TAMBAHAN: Fungsi untuk render multiple maps dengan layout dinamis
  // const renderMapsGrid = () => {
  //   // Hanya render multiple maps untuk tab Mitigasi/Adaptasi
  //   const isMitigasiAdaptasi = activeTab === 'Mitigasi/Adaptasi';

  //   // Jika bukan Mitigasi/Adaptasi, render single map
  //   if (!isMitigasiAdaptasi || mapCount === 1) {
  //     return (
  //       <div className="h-full w-full">
  //         <IndonesiaMap
  //           filterData={filterData}
  //           onDetailView={handleDetailView}
  //           detailView={detailView}
  //           onBackToMain={handleBackToMain}
  //           riskRefreshTrigger={riskRefreshTrigger}
  //         />
  //       </div>
  //     );
  //   }

  //   // 2 maps - grid 2 kolom
  //   if (mapCount === 2) {
  //     return (
  //       <div className="grid grid-cols-2 gap-2 h-full">
  //         {Array.from({ length: 2 }).map((_, i) => (
  //           <div key={i} className="h-full">
  //             <IndonesiaMap
  //               filterData={filterData}
  //               onDetailView={handleDetailView}
  //               detailView={detailView}
  //               onBackToMain={handleBackToMain}
  //               riskRefreshTrigger={riskRefreshTrigger}
  //             />
  //           </div>
  //         ))}
  //       </div>
  //     );
  //   }

  //   // 3 maps - 1 besar (kiri) + 2 kecil (kanan)
  //   if (mapCount === 3) {
  //     return (
  //       <div className="grid grid-cols-2 gap-2 h-full">
  //         <div className="row-span-2">
  //           <IndonesiaMap
  //             filterData={filterData}
  //             onDetailView={handleDetailView}
  //             detailView={detailView}
  //             onBackToMain={handleBackToMain}
  //             riskRefreshTrigger={riskRefreshTrigger}
  //           />
  //         </div>

  //         <div className="h-full">
  //           <IndonesiaMap
  //             filterData={filterData}
  //             onDetailView={handleDetailView}
  //             detailView={detailView}
  //             onBackToMain={handleBackToMain}
  //             riskRefreshTrigger={riskRefreshTrigger}
  //           />
  //         </div>

  //         <div className="h-full">
  //           <IndonesiaMap
  //             filterData={filterData}
  //             onDetailView={handleDetailView}
  //             detailView={detailView}
  //             onBackToMain={handleBackToMain}
  //             riskRefreshTrigger={riskRefreshTrigger}
  //           />
  //         </div>
  //       </div>
  //     );
  //   }

  //   // 4 maps - grid 2x2
  //   if (mapCount === 4) {
  //     return (
  //       <div className="grid grid-cols-2 gap-2 h-full">
  //         {Array.from({ length: 4 }).map((_, i) => (
  //           <div key={i} className="h-full">
  //             <IndonesiaMap
  //               filterData={filterData}
  //               onDetailView={handleDetailView}
  //               detailView={detailView}
  //               onBackToMain={handleBackToMain}
  //               riskRefreshTrigger={riskRefreshTrigger}
  //             />
  //           </div>
  //         ))}
  //       </div>
  //     );
  //   }

  //   // 10 maps - grid 2x5
  //   if (mapCount === 10) {
  //     return (
  //       <div className="grid grid-cols-5 gap-2 h-full" style={{ maxHeight: '100%' }}>
  //         {Array.from({ length: 10 }).map((_, i) => (
  //           <div key={i} className="h-full">
  //             <IndonesiaMap
  //               filterData={filterData}
  //               onDetailView={handleDetailView}
  //               detailView={detailView}
  //               onBackToMain={handleBackToMain}
  //               riskRefreshTrigger={riskRefreshTrigger}
  //             />
  //           </div>
  //         ))}
  //       </div>
  //     );
  //   }

  //   // 5-9 maps - layout kompleks
  //   if (mapCount >= 5) {
  //     const topMaps = Math.min(5, mapCount - 1);
  //     const remainingMaps = mapCount - 1 - topMaps;

  //     return (
  //       <div className="flex flex-col gap-2 h-full">
  //         {/* Baris atas: peta kecil horizontal (maksimal 5) */}
  //         {topMaps > 0 && (
  //           <div className="grid gap-2" style={{ 
  //             gridTemplateColumns: 'repeat(5, 1fr)',
  //             height: '28%'
  //           }}>
  //             {Array.from({ length: topMaps }).map((_, i) => (
  //               <div key={i} className="h-full">
  //                 <IndonesiaMap
  //                   filterData={filterData}
  //                   onDetailView={handleDetailView}
  //                   detailView={detailView}
  //                   onBackToMain={handleBackToMain}
  //                   riskRefreshTrigger={riskRefreshTrigger}
  //                 />
  //               </div>
  //             ))}
  //           </div>
  //         )}

  //         {/* Baris bawah */}
  //         {mapCount === 7 ? (
  //           // Untuk 7 peta: 2 besar di bawah
  //           <div className="grid grid-cols-2 gap-2 flex-1">
  //             <IndonesiaMap
  //               filterData={filterData}
  //               onDetailView={handleDetailView}
  //               detailView={detailView}
  //               onBackToMain={handleBackToMain}
  //               riskRefreshTrigger={riskRefreshTrigger}
  //             />

  //             <IndonesiaMap
  //               filterData={filterData}
  //               onDetailView={handleDetailView}
  //               detailView={detailView}
  //               onBackToMain={handleBackToMain}
  //               riskRefreshTrigger={riskRefreshTrigger}
  //             />
  //           </div>
  //         ) : (
  //           // Untuk 5, 6, 8, 9 peta: 1 besar + sidebar
  //           <div className="grid gap-2 flex-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
  //             {/* Peta besar utama */}
  //             <div style={{ gridColumn: remainingMaps > 0 ? 'span 4' : 'span 5' }} className="h-full">
  //               <IndonesiaMap
  //                 filterData={filterData}
  //                 onDetailView={handleDetailView}
  //                 detailView={detailView}
  //                 onBackToMain={handleBackToMain}
  //                 riskRefreshTrigger={riskRefreshTrigger}
  //               />
  //             </div>

  //             {/* Peta kecil di sidebar kanan */}
  //             {remainingMaps > 0 && (
  //               <div className="flex flex-col gap-2" style={{ gridColumn: '5' }}>
  //                 {Array.from({ length: remainingMaps }).map((_, i) => (
  //                   <div key={i} className="flex-1">
  //                     <IndonesiaMap
  //                       filterData={filterData}
  //                       onDetailView={handleDetailView}
  //                       detailView={detailView}
  //                       onBackToMain={handleBackToMain}
  //                       riskRefreshTrigger={riskRefreshTrigger}
  //                     />
  //                   </div>
  //                 ))}
  //               </div>
  //             )}
  //           </div>
  //         )}
  //       </div>
  //     );
  //   }

  //   // Default fallback - single map
  //   return (
  //     <div className="h-full w-full">
  //       <IndonesiaMap
  //         filterData={filterData}
  //         onDetailView={handleDetailView}
  //         detailView={detailView}
  //         onBackToMain={handleBackToMain}
  //         riskRefreshTrigger={riskRefreshTrigger}
  //       />
  //     </div>
  //   );
  // };

const getLayerDisplayName = (layerKey: string, filterData: any) => {
  // Untuk boundary layer
  if (layerKey.includes('boundary-only')) {
    return `Batas ${filterData.locationType}`;
  }
  
  // Untuk layer mitigation, ambil dari displayLayerName
  if (filterData.displayLayerName) {
    return filterData.displayLayerName;
  }
  
  // Fallback
  return 'Layer';
};

// ==================== FUNGSI LENGKAP renderMapsGrid ====================
const renderMapsGrid = () => {
  const isMitigasiAdaptasi = activeTab === 'Mitigasi/Adaptasi';

  // Jika bukan Mitigasi/Adaptasi ATAU tidak ada filterData, render single map
  if (!isMitigasiAdaptasi || !filterData) {
    return (
      <div className="h-full w-full">
        <IndonesiaMap
          filterData={filterData}
          onDetailView={handleDetailView}
          detailView={detailView}
          onBackToMain={handleBackToMain}
          riskRefreshTrigger={riskRefreshTrigger}
          selectedYear={selectedYear}
        />
      </div>
    );
  }

  // Untuk Mitigasi/Adaptasi: buat array konfigurasi untuk setiap peta
  const maps = [];
  
  // Dapatkan boundary layer dan disaster layer utama
  if (filterData.layers && filterData.layers.length > 0) {
    const boundaryLayer = filterData.layers.find(l => l.type === 'boundary');
    const allDisasterLayers = filterData.layers.filter(l => l.type === 'disaster');
    
    if (!boundaryLayer) {
      console.error('No boundary layer found!');
      return <div className="h-full w-full">No boundary layer available</div>;
    }

     // Map 1: Peta Utama
    if (filterData.mitigationMode === 'Gabungan' && allDisasterLayers.length === 2) {
      // Mode Gabungan: Boundary + 2 disaster layers (Kerawanan + Kebencanaan)
      maps.push({
        key: 'main-gabungan',
        filterData: {
          ...filterData,
          layers: [boundaryLayer, ...allDisasterLayers],
          displayLayerName: `${filterData.locationType} + Rawan & Bencana ${filterData.disasterType}`
        },
        index: 0
      });
    } else if (allDisasterLayers.length > 0) {
      // Mode Kerawanan/Kebencanaan: Boundary + 1 disaster layer
      const mainDisasterLayer = allDisasterLayers[0];
      maps.push({
        key: 'main-disaster',
        filterData: {
          ...filterData,
          layers: [boundaryLayer, mainDisasterLayer],
          displayLayerName: `${filterData.locationType} + ${mainDisasterLayer.layerName || 'Layer Utama'}`
        },
        index: 0
      });
    } else {
      // Fallback: hanya boundary
      maps.push({
        key: 'boundary-only',
        filterData: {
          ...filterData,
          layers: [boundaryLayer],
          displayLayerName: `Batas ${filterData.locationType}`
        },
        index: 0
      });
    }
    
    // Map 2, 3, 4, dst: Boundary + Main disaster + MASING-MASING 1 layer mitigation tambahan
    // filterData.selectedLayers?.forEach((layerName, idx) => {
    //   const mitigationLayer = filterData.layers.find(l => l.layerName === layerName && l.type === 'mitigation');
    //   if (mitigationLayer && mainDisasterLayer) {
    //      maps.push({
    //       key: layerName,
    //       filterData: {
    //         ...filterData,
    //         layers: [boundaryLayer, mainDisasterLayer, mitigationLayer],
    //         displayLayerName: `${filterData.locationType} + ${layerName}` // UBAH: Gunakan locationType, bukan layerName disaster
    //       },
    //       index: idx + 1
    //     });
    //   } else if (mitigationLayer) {
    //     // Jika tidak ada main disaster, boundary + mitigation saja
    //     maps.push({
    //       key: layerName,
    //       filterData: {
    //         ...filterData,
    //         layers: [boundaryLayer, mitigationLayer],
    //         displayLayerName: layerName
    //       },
    //       index: idx + 1
    //     });
    //   }
    // });
    filterData.selectedLayers?.forEach((layerName, idx) => {
      const mitigationLayer = filterData.layers.find(l => l.layerName === layerName && l.type === 'mitigation');
      if (mitigationLayer) {
        maps.push({
          key: layerName,
          filterData: {
            ...filterData,
            layers: [boundaryLayer, mitigationLayer], // HANYA boundary + 1 mitigation layer
            displayLayerName: `${filterData.locationType} + ${layerName}`
          },
          index: idx + 1
        });
      }
    });
  }

  const totalMaps = maps.length;

  // ==================== FUNGSI RENDER LEGEND UNTUK MAP UTAMA ====================
  const renderLegendForMainMap = () => {
    if (!filterData || maps.length === 0) return null;

    return (
      <div className="absolute bottom-4 left-4 bg-white/95 p-4 rounded-lg shadow-lg text-sm max-w-80 z-[1001]" style={{pointerEvents: 'auto'}}>
        <div className="font-bold text-gray-800 mb-3 pb-2 border-b border-gray-200">
          Legend Peta
        </div>
        
        <div className="space-y-2">
          {/* Boundary Layer - Always show first */}
          {/* <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
              style={{backgroundColor: getBoundaryColor(filterData.locationType)}}
            ></div>
            <span className="text-gray-700 text-xs">
              Batas {getBoundaryLabel(filterData.locationType)}
            </span>
          </div> */}

          {/* Main Disaster Layer - Show if exists */}
          {filterData.disasterType && filterData.mitigationMode === 'Gabungan' && (
            <>
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                  style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, 'Kerawanan')}}
                ></div>
                <span className="text-gray-700 text-xs font-semibold">
                  Layer Rawan {filterData.disasterType}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                  style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, 'Kebencanaan')}}
                ></div>
                <span className="text-gray-700 text-xs font-semibold">
                  Layer Bencana {filterData.disasterType}
                </span>
              </div>
            </>
          )}
          
          {filterData.disasterType && filterData.mitigationMode !== 'Gabungan' && (
            <div className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, filterData.mitigationMode)}}
              ></div>
              <span className="text-gray-700 text-xs font-semibold">
                Layer {filterData.mitigationMode} {filterData.disasterType}
              </span>
            </div>
          )}

          {/* Additional Mitigation Layers */}
          {filterData.selectedLayers && filterData.selectedLayers.length > 0 && (
            <>
              <div className="text-xs font-medium text-gray-600 mt-2 pt-2 border-t border-gray-200">
                Layer Tambahan:
              </div>
              {filterData.selectedLayers.map((layerName: string, idx: number) => (
                <div key={layerName} className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                    style={{backgroundColor: getMitigationLayerColor(layerName)}}
                  ></div>
                  <span className="text-gray-700 text-xs">{layerName}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Info tambahan */}
        <div className="text-xs text-gray-600 mt-3 pt-2 border-t border-gray-200">
          <div><strong>Jenis Bencana:</strong> {filterData.disasterType}</div>
          <div><strong>Area:</strong> {filterData.selectedValue}</div>
          <div><strong>Total Peta:</strong> {totalMaps}</div>
          <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
            <div><strong>Peta Utama:</strong> {filterData.mitigationMode === 'Gabungan' ? '3 layer' : '2 layer'}</div>
            {filterData.selectedLayers?.length > 0 && (
              <div><strong>Peta Tambahan:</strong> {filterData.selectedLayers.length} × 2 layer</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== RENDER: 1 PETA (TIDAK ADA LAYER DIPILIH) ====================
  if (totalMaps === 1) {
    return (
      <div className="h-full w-full relative">
        <div className="absolute top-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-md z-[1000] text-sm font-semibold border border-gray-200">
          {maps[0].filterData.displayLayerName}
        </div>
        {/* Legend untuk map tunggal */}
        {renderLegendForMainMap()}
        <IndonesiaMap
          filterData={maps[0].filterData}
          onDetailView={handleDetailView}
          detailView={detailView}
          onBackToMain={handleBackToMain}
          riskRefreshTrigger={riskRefreshTrigger}
        />
      </div>
    );
  }

  // ==================== RENDER: 2 PETA - GRID 2 KOLOM ====================
  if (totalMaps === 2) {
    return (
      <div className="grid grid-cols-2 gap-2 h-full">
        {maps.map((mapConfig, idx) => (
          <div key={mapConfig.key} className="h-full relative">
            <div className="absolute top-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-md z-[1000] text-sm font-semibold border border-gray-200">
              {mapConfig.filterData.displayLayerName}
            </div>
            {/* Legend hanya di map pertama */}
            {idx === 0 && renderLegendForMainMap()}
            <IndonesiaMap
              filterData={mapConfig.filterData}
              onDetailView={handleDetailView}
              detailView={detailView}
              onBackToMain={handleBackToMain}
              riskRefreshTrigger={riskRefreshTrigger}
            />
          </div>
        ))}
      </div>
    );
  }

  // ==================== RENDER: 3 PETA - 1 BESAR (KIRI) + 2 KECIL (KANAN) ====================
  if (totalMaps === 3) {
    return (
      <div className="grid grid-cols-2 gap-2 h-full">
        <div className="row-span-2 relative">
          <div className="absolute top-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-md z-[1000] text-sm font-semibold border border-gray-200">
            {maps[0].filterData.displayLayerName}
          </div>
          {/* Legend hanya di map utama (kiri) */}
          {renderLegendForMainMap()}
          <IndonesiaMap
            filterData={maps[0].filterData}
            onDetailView={handleDetailView}
            detailView={detailView}
            onBackToMain={handleBackToMain}
            riskRefreshTrigger={riskRefreshTrigger}
          />
        </div>

        <div className="h-full relative">
          <div className="absolute top-2 left-2 bg-white/90 px-2 py-1 rounded-lg shadow-md z-[1000] text-xs font-semibold border border-gray-200">
            {maps[1].filterData.displayLayerName}
          </div>
          <IndonesiaMap
            filterData={maps[1].filterData}
            onDetailView={handleDetailView}
            detailView={detailView}
            onBackToMain={handleBackToMain}
            riskRefreshTrigger={riskRefreshTrigger}
          />
        </div>

        <div className="h-full relative">
          <div className="absolute top-2 left-2 bg-white/90 px-2 py-1 rounded-lg shadow-md z-[1000] text-xs font-semibold border border-gray-200">
            {maps[2].filterData.displayLayerName}
          </div>
          <IndonesiaMap
            filterData={maps[2].filterData}
            onDetailView={handleDetailView}
            detailView={detailView}
            onBackToMain={handleBackToMain}
            riskRefreshTrigger={riskRefreshTrigger}
          />
        </div>
      </div>
    );
  }

  // ==================== RENDER: 4 PETA - GRID 2x2 ====================
  if (totalMaps === 4) {
    return (
      <div className="grid grid-cols-2 gap-2 h-full">
        {maps.map((mapConfig, idx) => (
          <div key={mapConfig.key} className="h-full relative">
            <div className="absolute top-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-md z-[1000] text-sm font-semibold border border-gray-200">
              {mapConfig.filterData.displayLayerName}
            </div>
            {/* Legend hanya di map pertama (kiri atas) */}
            {idx === 0 && renderLegendForMainMap()}
            <IndonesiaMap
              filterData={mapConfig.filterData}
              onDetailView={handleDetailView}
              detailView={detailView}
              onBackToMain={handleBackToMain}
              riskRefreshTrigger={riskRefreshTrigger}
            />
          </div>
        ))}
      </div>
    );
  }

  // ==================== RENDER: 5-7 PETA - LAYOUT KOMPLEKS ====================
  if (totalMaps >= 5 && totalMaps <= 7) {
    const topMaps = Math.min(4, totalMaps - 1);
    const remainingMaps = totalMaps - 1 - topMaps;

    return (
      <div className="flex flex-col gap-2 h-full">
        {/* Baris atas: peta kecil horizontal */}
        {topMaps > 0 && (
          <div className="grid gap-2" style={{ 
            gridTemplateColumns: `repeat(${topMaps}, 1fr)`,
            height: '28%'
          }}>
            {maps.slice(1, topMaps + 1).map((mapConfig) => (
              <div key={mapConfig.key} className="h-full relative">
                <div className="absolute top-1 left-1 bg-white/90 px-2 py-1 rounded shadow-md z-[1000] text-xs font-semibold border border-gray-200">
                  {mapConfig.filterData.displayLayerName}
                </div>
                <IndonesiaMap
                  filterData={mapConfig.filterData}
                  onDetailView={handleDetailView}
                  detailView={detailView}
                  onBackToMain={handleBackToMain}
                  riskRefreshTrigger={riskRefreshTrigger}
                />
              </div>
            ))}
          </div>
        )}

        {/* Baris bawah */}
        <div className="grid gap-2 flex-1" style={{ 
          gridTemplateColumns: remainingMaps > 0 ? '3fr 1fr' : '1fr' 
        }}>
          {/* Peta besar utama */}
          <div className="h-full relative">
            <div className="absolute top-2 left-2 bg-white/90 px-3 py-1.5 rounded-lg shadow-md z-[1000] text-sm font-semibold border border-gray-200">
              {maps[0].filterData.displayLayerName}
            </div>
            {/* Legend di map utama besar */}
            {renderLegendForMainMap()}
            <IndonesiaMap
              filterData={maps[0].filterData}
              onDetailView={handleDetailView}
              detailView={detailView}
              onBackToMain={handleBackToMain}
              riskRefreshTrigger={riskRefreshTrigger}
            />
          </div>

          {/* Peta kecil di sidebar kanan */}
          {remainingMaps > 0 && (
            <div className="flex flex-col gap-2">
              {maps.slice(topMaps + 1).map((mapConfig) => (
                <div key={mapConfig.key} className="flex-1 relative">
                  <div className="absolute top-1 left-1 bg-white/90 px-2 py-1 rounded shadow-md z-[1000] text-xs font-semibold border border-gray-200">
                    {mapConfig.filterData.displayLayerName}
                  </div>
                  <IndonesiaMap
                    filterData={mapConfig.filterData}
                    onDetailView={handleDetailView}
                    detailView={detailView}
                    onBackToMain={handleBackToMain}
                    riskRefreshTrigger={riskRefreshTrigger}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== RENDER: DEFAULT FALLBACK ====================
  return (
    <div className="h-full w-full relative">
      {renderLegendForMainMap()}
      <IndonesiaMap
        filterData={filterData}
        onDetailView={handleDetailView}
        detailView={detailView}
        onBackToMain={handleBackToMain}
        riskRefreshTrigger={riskRefreshTrigger}
      />
    </div>
  );
};
// ==================== AKHIR FUNGSI renderMapsGrid ====================

  // Check conditions for different tabs
  const isKebencanaan = activeTab === 'Kebencanaan';
  const isMitigasiAdaptasi = activeTab === 'Mitigasi' || activeTab === 'Adaptasi' || activeTab === 'Mitigasi/Adaptasi';
  const isKerawanan = activeTab === 'Kerawanan';
  const isDetailKerawanan = isKerawanan && detailView;
  const isShpManagementMode = activeTab === 'Manajemen File SHP';

  // Helper function to get legend content based on filter data and detail view
  const getLegendContent = () => {
    // Detail view legend
    if (detailView) {
      return (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-800 mb-2">
            Detail Area: {detailView.selectedArea}
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full border border-white" 
                 style={{backgroundColor: '#3B82F6'}}></div>
            <span className="text-gray-700">Titik Kejadian Banjir</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full border border-white" 
                 style={{backgroundColor: '#DC2626'}}></div>
            <span className="text-gray-700">Titik Kejadian Longsor</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-3 rounded-full border border-white" 
                 style={{backgroundColor: '#EA580C'}}></div>
            <span className="text-gray-700">Titik Kejadian Kebakaran</span>
          </div>
          
          <div className="text-xs text-gray-600 mt-2 pt-1 border-t border-gray-200">
            <div><strong>Tingkat Risiko:</strong> 
              <span style={{color: detailView.risk_color, fontWeight: 'bold'}}> {detailView.risk_level}</span>
            </div>
            <div><strong>Jumlah Kejadian:</strong> {detailView.incident_count}</div>
          </div>
        </div>
      );
    }

    if (!filterData) {
      return (
        <div className="text-xs text-gray-500">
          Pilih filter untuk melihat data
        </div>
      );
    }

    // Mitigation legend
    // if (filterData.category === 'Mitigasi/Adaptasi') {
    //   return (
    //     <div className="space-y-2">
    //       <div className="text-xs font-medium text-gray-800 mb-2">
    //         Layer Mitigasi/Adaptasi
    //         {riskRefreshTrigger > 0 && (
    //           <span className="ml-2 text-green-600 text-xs">(Layer Diperbarui)</span>
    //         )}
    //       </div>
          
    //       {/* Boundary layer */}
    //       <div className="flex items-center gap-2 text-xs">
    //         <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
    //              style={{backgroundColor: getBoundaryColor(filterData.locationType)}}></div>
    //         <span className="text-gray-700">
    //           Batas {getBoundaryLabel(filterData.locationType)}
    //         </span>
    //       </div>

    //       {/* Selected mitigation layers */}
    //       {filterData.selectedLayers && filterData.selectedLayers.length > 0 ? (
    //         filterData.selectedLayers.map((layerName: string) => (
    //           <div key={layerName} className="flex items-center gap-2 text-xs">
    //             <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
    //                  style={{backgroundColor: getMitigationLayerColor(layerName)}}></div>
    //             <span className="text-gray-700">{layerName}</span>
    //           </div>
    //         ))
    //       ) : (
    //         <div className="text-xs text-gray-500 italic">
    //           Belum ada layer peta yang dipilih
    //         </div>
    //       )}
          
    //       <div className="text-xs text-gray-600 mt-2 pt-1 border-t border-gray-200">
    //         <div><strong>Area:</strong> {filterData.selectedValue}</div>
    //         <div><strong>Level:</strong> {filterData.locationType}</div>
    //         <div><strong>Layer Aktif:</strong> {filterData.selectedLayers?.length || 0}</div>
    //       </div>
    //     </div>
    //   );
    // }

    if (filterData.category === 'Mitigasi/Adaptasi') {
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-800 mb-2">
          Layer Mitigasi/Adaptasi
          {riskRefreshTrigger > 0 && (
            <span className="ml-2 text-green-600 text-xs">(Layer Diperbarui)</span>
          )}
        </div>
        
        {/* Info jumlah peta */}
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
          <div className="text-xs font-semibold text-blue-800">
            📊 {1 + (filterData.selectedLayers?.length || 0)} Peta Ditampilkan
          </div>
          <div className="text-xs text-blue-700 mt-0.5">
            {filterData.mitigationMode === 'Gabungan' 
              ? `1 utama (3 layer) + ${filterData.selectedLayers?.length || 0} tambahan (2 layer each)`
              : `1 utama (2 layer) + ${filterData.selectedLayers?.length || 0} tambahan (2 layer each)`
            }
          </div>
        </div>

        {/* Boundary layer */}
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
               style={{backgroundColor: getBoundaryColor(filterData.locationType)}}></div>
          <span className="text-gray-700">
            Batas {getBoundaryLabel(filterData.locationType)}
          </span>
        </div>

        {/* Main disaster layer */}
        {filterData.disasterType && filterData.mitigationMode === 'Gabungan' && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                   style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, 'Kerawanan')}}></div>
              <span className="text-gray-700 font-semibold">
                Rawan {filterData.disasterType} (Peta Utama)
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                   style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, 'Kebencanaan')}}></div>
              <span className="text-gray-700 font-semibold">
                Bencana {filterData.disasterType} (Peta Utama)
              </span>
            </div>
          </>
        )}
        
        {filterData.disasterType && filterData.mitigationMode !== 'Gabungan' && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                 style={{backgroundColor: getMainDisasterLayerColor(filterData.disasterType, filterData.mitigationMode)}}></div>
            <span className="text-gray-700 font-semibold">
              {filterData.mitigationMode} {filterData.disasterType} (Peta Utama)
            </span>
          </div>
        )}

        {/* Selected mitigation layers */}
        {filterData.selectedLayers && filterData.selectedLayers.length > 0 && (
          <>
            <div className="text-xs font-medium text-gray-600 mt-2 pt-2 border-t border-gray-200">
              Layer Tambahan:
            </div>
            {filterData.selectedLayers.map((layerName: string) => (
              <div key={layerName} className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                     style={{backgroundColor: getMitigationLayerColor(layerName)}}></div>
                <span className="text-gray-700">{layerName}</span>
              </div>
            ))}
          </>
        )}
        
        <div className="text-xs text-gray-600 mt-2 pt-1 border-t border-gray-200">
          <div><strong>Jenis Bencana:</strong> {filterData.disasterType}</div>
          <div><strong>Area:</strong> {filterData.selectedValue}</div>
          <div><strong>Level:</strong> {filterData.locationType}</div>
        </div>
      </div>
    );
  }

    // Risk analysis legend for Kerawanan
    if (filterData.isRiskAnalysis) {
      return (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-800 mb-2">
            Tingkat Risiko {filterData.disasterType}
            {riskRefreshTrigger > 0 && (
              <span className="ml-2 text-green-600 text-xs">(Diperbarui)</span>
            )}
          </div>
          
          {/* Risk levels */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                 style={{backgroundColor: '#22c55e'}}></div>
            <span className="text-gray-700">Rendah (≤1 kejadian/tahun)</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                 style={{backgroundColor: '#f97316'}}></div>
            <span className="text-gray-700">Sedang (2-5 kejadian/tahun)</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                 style={{backgroundColor: '#ef4444'}}></div>
            <span className="text-gray-700">Tinggi (&gt;5 kejadian/tahun)</span>
          </div>

          {/* Boundary layer */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
                 style={{backgroundColor: getBoundaryColor(filterData.locationType)}}></div>
            <span className="text-gray-700">
              Batas {getBoundaryLabel(filterData.locationType)}
            </span>
          </div>
          
          <div className="text-xs text-gray-600 mt-2 pt-1 border-t border-gray-200">
            <div><strong>Area:</strong> {filterData.selectedValue === 'Indonesia' ? 'Seluruh Indonesia' : filterData.selectedValue}</div>
            <div><strong>Level:</strong> {filterData.locationType === 'Indonesia' ? 'Nasional' : getDisplayLevel(filterData.locationType)}</div>
            <div className="text-xs text-gray-500 mt-1">Klik layer untuk detail</div>
          </div>
        </div>
      );
    }

    // Regular disaster data legend for Kebencanaan
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <div 
            className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
            style={{backgroundColor: getBoundaryColor(filterData.locationType)}}
          ></div>
          <span className="text-gray-700">
            Batas {getBoundaryLabel(filterData.locationType)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div 
            className="w-4 h-4 rounded-sm border border-black/20 flex-shrink-0" 
            style={{backgroundColor: getDisasterColor(filterData.disasterTable)}}
          ></div>
          <span className="text-gray-700">Area {filterData.disasterType}</span>
        </div>
        <div className="text-xs text-gray-600 mt-2 pt-1 border-t border-gray-200">
          Filter: {filterData.selectedValue === 'Indonesia' ? 'Seluruh Indonesia' : filterData.selectedValue}
        </div>
      </div>
    );
  };

  // Helper functions for legend
  const getBoundaryColor = (locationType: string): string => {
    const colorMap: Record<string, string> = {
      'Provinsi': '#FFA500',
      'Daerah Administratif': '#FFA500',
      'Kabupaten/Kota': '#00BFFF',
      'Kecamatan': '#FFD700',
      'DAS': '#00FFFF'
    };
    return colorMap[locationType] || '#FFA500';
  };

  const getBoundaryLabel = (locationType: string): string => {
    const labelMap: Record<string, string> = {
      'Provinsi': 'Provinsi',
      'Daerah Administratif': 'Provinsi',
      'Kabupaten/Kota': 'Kabupaten/Kota',
      'Kecamatan': 'Kecamatan',
      'DAS': 'DAS'
    };
    return labelMap[locationType] || 'Area';
  };

  const getDisplayLevel = (locationType: string): string => {
    if (locationType === 'Indonesia') return 'Menampilkan Provinsi';
    if (locationType === 'Provinsi') return 'Menampilkan Kabupaten/Kota';
    if (locationType === 'Kabupaten/Kota') return 'Menampilkan Kecamatan';
    if (locationType === 'Kecamatan') return 'Menampilkan Kelurahan/Desa';
    if (locationType === 'DAS') return 'Menampilkan Area DAS';
    return 'Area Terpilih';
  };

  // Helper function untuk warna mitigation layer
  const getMitigationLayerColor = (layerName: string): string => {
    const colorMap: Record<string, string> = {
      // Layer baru per disaster type
      'Limpasan Air': '#4444FF',
      'Tutupan Lahan': '#44FF44',
      'Lahan Kritis': '#FF4444',
      'Bahaya Erosi': '#FFAA44',
      'Kerentanan Kebakaran': '#AA44FF',
      
      // Layer lama (backward compatibility)
      'Peta Areal Karhutla': '#DC143C',
      'Peta Lahan Kritis': '#FF4444', 
      'Peta Penutupan Lahan': '#44FF44',
      'Peta Rawan Karhutla': '#AA44FF',
      'Peta Rawan Erosi': '#FFAA44',
      'Peta Rawan Limpasan': '#4444FF'
    };
    
    return colorMap[layerName] || '#666666';
  };

  const getMainDisasterLayerColor = (disasterType: string, mode?: string): string => {
    // Ambil mode dari parameter atau filterData
    const selectedMode = mode || filterData?.mitigationMode || 'Kerawanan';
    
    if (selectedMode === 'Kerawanan') {
      const colorMap: Record<string, string> = {
        'Longsor': '#FFAA44',      // Rawan Erosi - orange
        'Banjir': '#4444FF',       // Rawan Limpasan - biru
        'Kebakaran': '#AA44FF'     // Rawan Karhutla - ungu
      };
      return colorMap[disasterType] || '#888888';
    } else if (selectedMode === 'Kebencanaan') {
      const colorMap: Record<string, string> = {
        'Longsor': '#FF4444',      // Lahan Kritis - merah
        'Banjir': '#44FF44',       // Penutupan Lahan - hijau
        'Kebakaran': '#DC143C'     // Areal Karhutla - merah tua
      };
      return colorMap[disasterType] || '#888888';
    } else {
      // Mode Gabungan: return warna default (akan ada 2 layer dengan warna berbeda)
      return '#666666';
    }
  };

  const getShpLayerColor = (tableName: string): string => {
    const colorMap: Record<string, string> = {
      'provinsi': '#FFA500',
      'kab_kota': '#00BFFF',
      'kecamatan': '#FFD700',
      'kel_desa': '#98FB98',
      'das': '#00FFFF',
      'lahan_kritis': '#FF4444',
      'penutupan_lahan_2024': '#44FF44',
      'rawan_erosi': '#FFAA44',
      'rawan_karhutla_2024': '#AA44FF',
      'rawan_limpasan': '#4444FF',
      'areal_karhutla_2024': '#DC143C',
    };
    return colorMap[tableName] || '#888888';
  };

  return (
    <div className="mockup-container">
      <div className="mockup-grid">
        

        <div className="mockup-cell relative">
          {renderMapsGrid()}
        </div>

        {/* Cell 2: Filter */}
        <div className="mockup-cell relative">
          <Filter 
            onFilterChange={handleFilterChange} 
            onTabChange={handleTabChange}
            onResetToMain={handleResetToMain}
            onMapCountChange={handleMapCountChange}
          />
        </div>

        {/* Cell 3: Show ChartTabs when in detail kerawanan, otherwise show based on tab */}
        {(isDetailKerawanan) && (
          <div className="mockup-cell">
            <ChartTabsComponent
                disasterType={
                  detailView.disaster_type?.toLowerCase() === 'kebakaran' ? 'kebakaran' :
                  detailView.disaster_type?.toLowerCase() === 'longsor' ? 'longsor' :
                  detailView.disaster_type?.toLowerCase() === 'banjir' ? 'banjir' :
                  'kebakaran'
                }
                isKerawananMode={true}
                kerawananFilters={{
                  disaster_type: detailView.disaster_type,
                  provinsi: detailView.level === 'provinsi' ? detailView.selectedArea : null,
                  kabupaten: detailView.level === 'kabupaten' ? detailView.selectedArea : null,
                  kecamatan: detailView.level === 'kecamatan' ? detailView.selectedArea : null,
                  kelurahan: detailView.level === 'kelurahan' ? detailView.selectedArea : null,
                  das: detailView.das || null
                }}
                className="mt-6"
                isInMockup={true}
              />
          </div>
        )}
        {(isMitigasiAdaptasi) && (
          <div className="mockup-cell">
            <DataTable/>
          </div>
        )}
        
        {(isKebencanaan && !isDetailKerawanan) && (
          <div className="mockup-cell">
            <DetailedStatistic 
              filterData={filterData}
              onYearSelect={handleYearSelect}
              selectedYear={selectedYear}
            />
          </div>
        )}

        {isShpManagementMode && (
          <div className="mockup-cell">
            <ShpManagement onViewChange={() => handleTabChange('Kerawanan')} onFilterChange={handleFilterChange} />
          </div>
        )}

        {/* Cell 4: Show appropriate component based on state */}
        {(isMitigasiAdaptasi && !isDetailKerawanan) && (
          <div className="mockup-cell">
            <FileManager />
          </div>
        )}

        {(isKebencanaan && !isDetailKerawanan) && (
          <div className="mockup-cell">
            <Statistic 
              filterData={filterData}
              selectedYear={selectedYear}
            />
          </div>
        )}

        {/* Cell 4: Empty when in detail kerawanan to give more space to chart */}
        {isDetailKerawanan && (
          <div className="mockup-cell">
            <DetailKerawananPhotos 
              detailView={detailView}
            />
          </div>
        )}

      </div>
      
      {/* Table Data Section - Show when tab is "Kebencanaan" dengan risk update handler */}
      {isKebencanaan && (
        <div className="table-data-section">
          <TableDataView 
            filterData={filterData} 
            onRiskAnalysisUpdate={handleRiskAnalysisUpdate}
          />
        </div>
      )}
    </div>
  );
}

export default Mockup;

// Helper function untuk mendapatkan warna disaster
function getDisasterColor(disasterTable: string): string {
  const colorMap: Record<string, string> = {
    'lahan_kritis': '#FF4444',
    'penutupan_lahan_2024': '#44FF44', 
    'rawan_erosi': '#FFAA44',
    'rawan_karhutla_2024': '#AA44FF',
    'rawan_limpasan': '#4444FF',
    'areal_karhutla_2024': '#DC143C'
  };
  
  return colorMap[disasterTable] || '#666666';
}