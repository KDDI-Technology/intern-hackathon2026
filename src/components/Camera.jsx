import { useEffect, useState } from "react";
import { Camera as CameraIcon } from "lucide-react";

function Camera() {
  const [photoUrl, setPhotoUrl] = useState(null);

  const [loading, setLoading] = useState(false);

  const [message, setMessage] =
    useState("確認ボタンを押してください");

  const [capturedTime, setCapturedTime] =
    useState(null);


  /**
   * 写真を撮影する
   */
  const capturePhoto = async () => {
    if (loading) return;

    setLoading(true);
    setMessage("撮影しています...");

    try {
      const response = await fetch(
        "/api/camera/capture",
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          `HTTP Error: ${response.status}`
        );
      }


      // =========================
      // 撮影時刻を取得
      // =========================

      const capturedAt =
        response.headers.get(
          "X-Captured-At"
        );

      if (capturedAt) {
        const date =
          new Date(capturedAt);

        const formattedTime =
          new Intl.DateTimeFormat(
            "ja-JP",
            {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            }
          ).format(date);

        setCapturedTime(
          formattedTime
        );
      }


      // =========================
      // 写真を表示
      // =========================

      const blob =
        await response.blob();

      const newPhotoUrl =
        URL.createObjectURL(blob);


      setPhotoUrl(
        (oldPhotoUrl) => {

          if (oldPhotoUrl) {
            URL.revokeObjectURL(
              oldPhotoUrl
            );
          }

          return newPhotoUrl;
        }
      );


      setMessage("撮影しました");

    } catch (error) {

      console.error(error);

      setMessage(
        "撮影に失敗しました"
      );

    } finally {

      setLoading(false);

    }
  };


  useEffect(() => {

    return () => {

      if (photoUrl) {
        URL.revokeObjectURL(
          photoUrl
        );
      }

    };

  }, [photoUrl]);


  return (
    <section className="camera-card">

      <h2>
        お菓子在庫確認
      </h2>


      <p className="status">
        {message}
      </p>


      {capturedTime && (
        <p className="capture-time">
          撮影日時：{capturedTime}
        </p>
      )}


      <div className="photo-area">

        {photoUrl ? (

          <img
            src={photoUrl}
            alt="Raspberry Piで撮影した写真"
          />

        ) : (

          <div className="photo-placeholder">

            撮影した写真が
            <br />
            ここに表示されます

          </div>

        )}

      </div>


      <button
        className="capture-button"
        onClick={capturePhoto}
        disabled={loading}
      >

        <CameraIcon size={18} aria-hidden="true" />
        {loading
          ? "撮影中..."
          : "確認"}

      </button>

    </section>
  );
}

export default Camera;
